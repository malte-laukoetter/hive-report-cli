import * as inquirer from 'inquirer';
import { default as fetch } from 'node-fetch';
import * as urlencode from 'urlencode';
import { GameTypes, Player } from 'hive-api';
import * as FormData from 'form-data';
import * as request from 'request'
import { promisify, inspect } from 'util'
import * as Configstore from 'configstore';
import * as Rx from 'rxjs/Rx';
import * as fs from 'fs';
import * as readDirRecursiceCallback from 'recursive-readdir'
import * as readline from 'readline';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Throttle } from 'stream-throttle';
import * as commander from 'commander';

const readdir = promisify(readDirRecursiceCallback);
const fileStat = promisify(fs.stat)
const readFile = promisify(fs.readFile)

const HIVE_LOGIN_LINK_REGEX = /https\:\/\/secure.hivemc.com\/directlogin\/\?UUID\=.*\&token=.*/;
const HIVE_GAMELOG_URL_REGEX = /.*hivemc\.com\/\w*\/game\/\d*/;
const HIVE_GAMELOG_CHAT_PLAYER_REGEX = /(?<=class="chat">(\s|\\n)<p><em>)[A-Za-z0-9_]{3,16}/g;
const HIVE_CHATREPORT_PLAYER_REGEX = /(?<=Chat log of <a href="\/player\/)[a-zA-Z0-9_]{3,16}/

const conf = new Configstore('hive-report-cmd');

commander
  .usage('[options] [chatreport or gamelog]')
  .option('--max-upload-speed <n>', 'Sets the maximum speed for Youtube uploads in bytes/s', parseInt)
  .option('--video-dir <str>', 'Sets the directory to search for videos for hacking reports')
  .parse(process.argv);
  
if (commander.maxUploadSpeed) conf.set('max_upload_speed', commander.maxUploadSpeed);
if (!conf.has('max_upload_speed')) conf.set('max_upload_speed', 250000);

if (commander.videoDir) conf.set('video_dir', commander.videoDir);

GameTypes.update();

enum Questions {
  LOGIN = 'login',
  PLAYERS = 'players',
  PLAYERS_LIST = 'players_list',
  CATEGORY = 'category',
  REASON = 'reason',
  EVIDENCE = 'evidence',
  EVIDENCE_VIDEO = 'evidence_video',
  COMMENT = 'comment'
};

const questionRegistry: Map<Questions, any> = new Map();

const prompts = new Rx.Subject();

const answers = {
  login: null,
  players: null,
  reason: null,
  category: null,
  evidence: null,
  comment: null,
  videoUpload: false
};

const prompt = (inquirer.prompt((prompts as any)) as any);

prompt.ui.process.subscribe(
  async ans => {
    switch (ans.name) {
      case Questions.PLAYERS_LIST:
        answers.players = Promise.all(ans.answer.map(p => new Player(p).info().then(i => i.uuid)));
        nextQuestion(Questions.CATEGORY);
        break;
      case Questions.PLAYERS:
        answers.players = Promise.all(ans.answer.split(/ /g).map(p => new Player(p).info().then(i => i.uuid)));
        nextQuestion(Questions.CATEGORY);
        break;
      case Questions.CATEGORY:
        answers.category = ans.answer;
        nextQuestion(Questions.REASON);
        break;
      case Questions.REASON:
        answers.reason = ans.answer;
        if (answers.category === 'hacking' && conf.has('video_dir')){
          nextQuestion(Questions.EVIDENCE_VIDEO);
        }else{
          nextQuestion(Questions.EVIDENCE);
        }
        break;
      case Questions.EVIDENCE_VIDEO:
        if (ans.answer === 'write your own'){
          nextQuestion(Questions.EVIDENCE);
        } else {
          answers.videoUpload = true;
          answers.evidence = uploadFile(ans.answer, () => nextQuestion(Questions.COMMENT)).then(data => `https://www.youtube.com/watch?v=${data.id}`);
        }
        break;
      case Questions.EVIDENCE:
        answers.evidence = ans.answer;
        nextQuestion(Questions.COMMENT);
        break;
      case Questions.COMMENT:
        answers.comment = ans.answer;
        prompts.complete()
        break;
    }
  },
  err => console.error(err),
  async _ => {
    // close the prompt for real so we can create a new one
    prompt.ui.close();

    const [token, uuid, cookiekey] = await getReportToken();
    
    if(answers.videoUpload){
      console.log(`Uploaded Video to ${await answers.evidence}`);
    }

    await submitReport(token, uuid, cookiekey, await answers.players, await answers.category, await answers.reason, await answers.evidence, await answers.comment);
  }
);

function nextQuestion(id: Questions) {
  prompts.next(questionRegistry.get(id));
}

questionRegistry.set(Questions.LOGIN, {
  type: 'input',
  name: Questions.LOGIN,
  message: 'Login Link:',
  validate: str => HIVE_LOGIN_LINK_REGEX.test(str)
});

questionRegistry.set(Questions.PLAYERS, {
  type: 'input',
  name: Questions.PLAYERS,
  message: 'Players:',
  default: () => answers.players ? answers.players.join(" ") : null,
  validate: async str => {
    if (str.includes('hivemc.com')) return true;

    return Promise.all(str.split(' ').map(async nameOrUuid => {
      if (!/(.{3,16}|[0-9a-fA-F]{32})/.test(nameOrUuid)) return nameOrUuid;

      return new Player(nameOrUuid).info().then(info => info.uuid.length > 0).catch(_ => nameOrUuid);
    })).then(arr => {
      let names = arr.filter(a => typeof a === 'string');
      return names.length == 0 ? true : `Unknown Players: ${names.join(', ')}`;
    });
  }
});

questionRegistry.set(Questions.PLAYERS_LIST, {
  type: 'checkbox',
  name: Questions.PLAYERS_LIST,
  message: 'Players:',
  choices: () => answers.players,
  validate: arr => arr.length > 0 ? true : 'You need to select atleast one player!'
});

questionRegistry.set(Questions.CATEGORY, {
  type: 'list',
  name: Questions.CATEGORY,
  message: 'Category:',
  choices: [
    'hacking',
    'chat',
    'behaviour'
  ],
  default: () => answers.category
});

questionRegistry.set(Questions.REASON, {
  type: 'list',
  name: Questions.REASON,
  message: 'Reason:',
  pageSize: 20,
  choices: _ => {
    switch (answers.category) {
      case 'hacking':
        return ['speed', 'aimbot', 'dim', 'forcefield', 'flying', 'noswing', 'waterwalking', 'minimap', 'noknockback', 'killaura', 'noslowdown', 'movementemulator', 'teamhack', 'blink', 'xray', 'derp', 'fastplace'];
      case 'chat':
        return ['spamclean', 'spamdirty', 'porn', 'playerabuse', 'advertising', 'impersonating', 'foullanguage', 'trolling', 'racism', 'discrimination', 'ddos'];
      case 'behaviour':
        return ['premabuse', 'glitch', 'team', 'rdm', 'ghost', 'shardtrolling', 'skin', 'harass', 'teamkill', 'karma', 'inappropriatedrawing', 'name'];
    }
  },
  default: () => answers.reason
});

questionRegistry.set(Questions.EVIDENCE, {
  type: 'input',
  name: Questions.EVIDENCE,
  message: 'Evidence:',
  validate: (str) => {
    return str.length > 5;
  },
  default: () => answers.evidence
});

questionRegistry.set(Questions.EVIDENCE_VIDEO, {
  type: 'list',
  name: Questions.EVIDENCE_VIDEO,
  message: 'Evidence:',
  choices: () => readdir(conf.get('video_dir'))
    // we only want mp4 files
    .then(res => res.filter(a => a.endsWith('.mp4')))
    // get the time the file was last modified
    .then(a => Promise.all(a.map(async file => [file, await fileStat(file).then(a => a.mtimeMs)])))
    // sort by this time
    .then(a => a.sort(([_, t1], [__, t2]) => t2 - t1))
    // get the 10 newest files
    .then(a => a.slice(0, 10))
    // change back to only the file name
    .then(a => a.map(([f, _]) => f))
    .then(a => a.concat(['write your own']))
});

questionRegistry.set(Questions.COMMENT, {
  type: 'input',
  name: Questions.COMMENT,
  message: 'Comment:',
  default: () => answers.comment
});

let loginFailCounter = 0;

async function getReportToken() {
  let uuid, cookiekey;

  if(conf.has('uuid') && conf.has('cookiekey')){
    uuid = conf.get('uuid');
    cookiekey = conf.get('cookiekey');
  }else{
    [uuid, cookiekey] = await loginToHive();
  }

  const token = await fetch('http://report.hivemc.com/', {
    headers: {
      cookie: `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`
    }
  })
  .then(res => res.text())
  .then(res => res.match(/(?<=_token: ")[a-zA-Z0-9]{40}(?=")/)[0])
  .catch(err => {
    loginFailCounter++;
    return null;
  });

  if(!token && loginFailCounter <= 1){
    conf.set('uuid', null);
    conf.set('cookiekey', null);
    
    return getReportToken();
  }else if(loginFailCounter <= 1){
    return [token, uuid, cookiekey];
  }else{
    console.error('Failed to login to the Hive...')
    process.exit();
  }
}

async function loginToHive(): Promise<string[]>{
  const promptsLogin = new Rx.Subject();

  let returnValue: Promise<string[]> = new Promise((resolve, reject) => {

    (inquirer.prompt((promptsLogin as any)) as any).ui.process.subscribe(
      async ans => {
        promptsLogin.complete();

        const [uuid, cookiekey] = await fetch(ans.answer, {
          redirect: 'manual'
        }).then(res => [
          res.headers.get('set-cookie').match(/(?<=hive_UUID=)[a-f0-9]{32}/)[0],
          res.headers.get('set-cookie').match(/(?<=hive_cookiekey=)[A-Za-z0-9]{10}/)[0]
        ]);

        conf.set('uuid', uuid);
        conf.set('cookiekey', cookiekey);

        resolve([uuid, cookiekey])
      },
      err => console.error(err)
    );
  });
  
  promptsLogin.next({
    type: 'input',
    name: Questions.LOGIN,
    message: 'Login Link_:',
    validate: str => {
      return true;
    }//HIVE_LOGIN_LINK_REGEX.test(str)
  });

  return returnValue;
}

async function submitReport(token, uuid, cookiekey, uuids, category, reason, evidence, comment) {
  // creates a url encoded string payload based on the object
  const payload = Object.entries({
    category: category,
    reason: reason,
    comment: comment,
    evidence: evidence,
    UUIDs: uuids,
    notify: true,
    _token: token
  })
  // parse array elements to be expanded into multiple
  .reduce((arr, [key, val]) => {
    if (Array.isArray(val)) {
      val.forEach(val => {
        arr.push([`${key}[]`, val])
      });
    } else {
      arr.push([key, val])
    }
    return arr;
  }, [])
  // urlencode keys and vals
  .map(([key, val]) => [urlencode(key), urlencode(val)])
  // create string from them
  .map(([key, val]) => `${key}=${val}`)
  .join('&');


  await fetch('https://report.hivemc.com/ajax/receive', {
    method: 'POST',
    headers: {
      'Cookie': `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': payload.length.toString(),
      'Host': 'report.hivemc.com',
      'Origin': 'http://report.hivemc.com',
      'Referer': 'http://report.hivemc.com/',
      'Uesr-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: payload
  }).then(res => {
    if (res.status === 200) {
      console.log("Report submitted successfully");
      process.exit();
    } else {
      console.log(`Submission failed: (${res.status}) ${res.statusText}`);
      console.error(res)
      process.exit();
    }
  }).catch(err => console.error(err));
}

function uploadFile(filePath, afterAuthCallback) {
  return readFile('client_secret.json').then(async content => {
    const auth = await authorize(JSON.parse(content.toString()));

    afterAuthCallback();

    return videosInsert(auth, filePath);
  });
}

function authorize(credentials) {
  const oauth2Client = new OAuth2Client(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    credentials.installed.redirect_uris[0]
  );

  // Check if we have previously stored a token.
  if (conf.has("oauth_google")){
    oauth2Client.credentials = conf.get("oauth_google");
    return oauth2Client;
  }else{
    return getNewToken(oauth2Client);
  }
}

function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.force-ssl']
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question('Enter the code from that page here: ', code => {
      rl.close();

      resolve(oauth2Client.getToken(code).then(({ tokens }) => {
        oauth2Client.credentials = tokens;

        conf.set("oauth_google", tokens);

        resolve(oauth2Client);
      }).catch(err => console.log('Error while trying to retrieve access token', err)));
    });
  });
}

function videosInsert(auth, videoFileName) {
  const service = google.youtube({ version: 'v3', auth: auth });

  return promisify(service.videos.insert)({
    notifySubscribers: false,
    resource: {
      name: videoFileName,
      mimeType: 'video/*',
      snippet: {
        title: videoFileName.split(/(\/|\\)/g).reduce((_, a) => a, "").split('.')[0],
      },
      status: {
        privacyStatus: 'unlisted'
      }
    },
    media: {
      mimeType: 'video/*',
      body: fs.createReadStream(videoFileName).pipe(new Throttle({ rate: conf.get('max_upload_speed') }) as any)
    },
    part: "id,snippet,status"
  }).then(data => {
    return data.data;
  }).catch(err => {
    console.log("if the error is maxBodyLength -> edit node_modules/follow-redirects/index.js line 226 to something bigger")

    return err;
  });
}


if (commander.args[0]) {
  const url = commander.args[0];

  if (/(chat|log)/.test(url)) {
    // Chat Log
    answers.evidence = url;
    answers.category = 'chat';

    answers.players = fetch(url).then(res => res.text()).then(res =>
      Promise.all([new Player(res.match(HIVE_CHATREPORT_PLAYER_REGEX)[0]).info().then(i => i.uuid)])
    ).catch(err => {
      console.error("\nError parsing ChatLog:\n", err);
      process.exit()
    });

    nextQuestion(Questions.CATEGORY);
  } else if (HIVE_GAMELOG_URL_REGEX.test(url)) {
    // Game log
    answers.evidence = url;
    answers.category = 'chat';
    answers.players = fetch(url).then(res => res.text()).then(res => [... new Set(res.match(HIVE_GAMELOG_CHAT_PLAYER_REGEX))]);

    nextQuestion(Questions.PLAYERS_LIST)
  }else {
    console.log("Thats not a link i know what to do with...");
    answers.evidence = url;

    nextQuestion(Questions.PLAYERS);
  }
} else {
  nextQuestion(Questions.PLAYERS);
}
