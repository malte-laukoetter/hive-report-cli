import * as inquirer from 'inquirer';
import { default as fetch } from 'node-fetch';
import { Player } from 'hive-api';
import { promisify, inspect } from 'util'
import * as Configstore from 'configstore';
import * as Rx from 'rxjs/Rx';
import * as readDirRecursiceCallback from 'recursive-readdir'
import * as fs from 'fs';
import { Report } from './report';
import { Categories } from './Category';
import { uploadFile } from './YoutubeUpload';
import * as commander from 'commander';
import { HiveLogin } from './HiveLogin';
import * as pkginfo from 'pkginfo';

/*
 * The filename is important for commander!
 */

const readdir = promisify(readDirRecursiceCallback);
const fileStat = promisify(fs.stat)

const HIVE_GAMELOG_URL_REGEX = /.*hivemc\.com\/[\w-]*\/game\/\d*/;
const HIVE_PLAYER_LINK_REGEX = /(?<=avatar\/)[A-Za-z0-9_]{3,16}(?=\/42)/g; // matches the names used in the links for the avatars in the box of all players
const HIVE_CHATREPORT_PLAYER_REGEX = /(?<=Chat log of <a href="\/player\/)[a-zA-Z0-9_]{3,16}/
const HIVE_CHATREPORT_ID_REGEX = /(?<=http:\/\/chatlog\.hivemc\.com\/\?logId=)[a-f0-9]*/
const HIVE_CHATREPORT_NOT_LOADED_REGEX = /gamedatanotfound/
const HIVE_CHATREPORT_UUID_FROM_LINK_REGEX = /(?<=\/)[a-f0-9]{32}$/
pkginfo(module, 'name');
const conf = new Configstore(module.exports.name);

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

async function saveStats(report: Report) {
  const reports = conf.has('reports') ? conf.get('reports') : [];

  reports.push({
    players: await report.uuids(),
    category: (await report.category).id,
    reason: (await report.reason).id,
    evidence: await report.evidence,
    comment: await report.comment
  });

  conf.set('reports', reports);
}

commander
  .description('creates a report')
  .on('--help', _ => console.log(`
  
  Creates a new report and optionaly fetches all available information from a given log.
  If it is a hacking report it also allowes to select a video that then will be automaticly uploaded to youtube and then be added to the report
  (needs a youtube account and will prompt for authentification on the first use).
  After that it prompts for all other informations.
  (The command expects the same information as https://report.hivemc.com and provides simmilar testing of the inputs)`
  ))
  .parse(process.argv);

const questionRegistry: Map<Questions, any> = new Map();

const prompts = new Rx.Subject();

const answers = {
  login: null,
  report: new Report(),
  videoUpload: false
};

const prompt = (inquirer.prompt((prompts as any)) as any);

prompt.ui.process.subscribe(
  async ans => {
    switch (ans.name) {
      case Questions.PLAYERS_LIST:
        answers.report.players = new Set();
        ans.answer.map(a => answers.report.addPlayer(a));
        nextQuestion(Questions.CATEGORY);
        break;
      case Questions.PLAYERS:
        ans.answer.split(/ /g).map(a => answers.report.addPlayer(a));
        nextQuestion(Questions.CATEGORY);
        break;
      case Questions.CATEGORY:
        answers.report.category = ans.answer;
        nextQuestion(Questions.REASON);
        break;
      case Questions.REASON:
        answers.report.reason = ans.answer;
        if ((await answers.report.category).id === 'hacking' && conf.has('video_dir')) {
          nextQuestion(Questions.EVIDENCE_VIDEO);
        } else {
          nextQuestion(Questions.EVIDENCE);
        }
        break;
      case Questions.EVIDENCE_VIDEO:
        if (ans.answer === 'write your own') {
          nextQuestion(Questions.EVIDENCE);
        } else {
          answers.videoUpload = true;
          answers.report.evidence = uploadFile(ans.answer, () => nextQuestion(Questions.COMMENT)).then(data => `https://www.youtube.com/watch?v=${data.id}`);
        }
        break;
      case Questions.EVIDENCE:
        answers.report.evidence = ans.answer;
        nextQuestion(Questions.COMMENT);
        break;
      case Questions.COMMENT:
        answers.report.comment = ans.answer;
        prompts.complete()
        break;
    }
  },
  err => console.error(err),
  async _ => {
    // close the prompt for real so we can create a new one
    prompt.ui.close();

    if (answers.videoUpload) {
      console.log(`Uploaded Video to ${await answers.report.evidence}`);
    }

    saveStats(answers.report);

    const login = new HiveLogin()

    answers.report.submit(login).then(async res => {
      if (res.status === 200) {
        console.log("Report submitted successfully");
        process.exit();
      } else {
        console.log(`Submission failed: (${res.status}) ${res.statusText}`);
        console.error(await res.text())
        process.exit();
      }
    }).catch(err => {
      console.error(err)
      process.exit();
    });
  }
);

function nextQuestion(id: Questions) {
  prompts.next(questionRegistry.get(id));
}

questionRegistry.set(Questions.PLAYERS, {
  type: 'input',
  name: Questions.PLAYERS,
  message: 'Players:',
  default: async () => answers.report.players.size > 0 ? (await answers.report.uuids()).join(" ") : null,
  validate: async str => {
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
  choices: () => Promise.all([...answers.report.players].map(async player => {
    return {
      name: (await player).name,
      value: player,
      short: (await player).name
    }
  })),
  validate: arr => arr.length > 0 ? true : 'You need to select atleast one player!'
});

questionRegistry.set(Questions.CATEGORY, {
  type: 'list',
  name: Questions.CATEGORY,
  message: 'Category:',
  choices: _ => Categories.asChoices(),
  default: () => answers.report.category
});

questionRegistry.set(Questions.REASON, {
  type: 'list',
  name: Questions.REASON,
  message: 'Reason:',
  pageSize: 20,
  choices: async _ => (await answers.report.category).reasonChoices(),
  default: () => answers.report.reason
});

questionRegistry.set(Questions.EVIDENCE, {
  type: 'input',
  name: Questions.EVIDENCE,
  message: 'Evidence:',
  validate: async (str) => (await answers.report.category).validate(str),
  filter: str => {
    if (HIVE_CHATREPORT_ID_REGEX.test(str)) {
      str = `https://hivemc.com/chatlog/${str.match(HIVE_CHATREPORT_ID_REGEX)[0]}`
    }

    return str
  },
  default: () => answers.report.evidence
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
  default: () => answers.report.comment
});

if (commander.args[0]) {
  const url = commander.args[0];

  if(/partylog/.test(url)){
    answers.report.evidence = url;
    answers.report.category = Categories.get('chat');

    const login = new HiveLogin();

    login.fetch(url)
      .then(res => res.text())
      .then(res => {
        // our general login detection doesn't work here so we need to do it by hand
        if (/You aren't signed in/.test(res)){
          login.logout();

          return this.fetch(url).then(res => res.text());
        }

        return res;
      }).then((res: string) => {
        [... new Set(res.match(HIVE_PLAYER_LINK_REGEX))].map(a => answers.report.addPlayer(a));
        return;
      })
      .then(_ => nextQuestion(Questions.PLAYERS_LIST));

  } else if (/(chat|log)/.test(url)) {
    // Chat Log
    answers.report.evidence = url;
    answers.report.category = Categories.get('chat');

    fetch(url).then(res => res.text()).then(async res => {
      let player = "";

      if (HIVE_CHATREPORT_NOT_LOADED_REGEX.test(res)) {
        player = url.match(HIVE_CHATREPORT_UUID_FROM_LINK_REGEX)[0]
        console.log(`Chatreport not yet available, Player: ${await new Player(player).info().then(i => i.name)}`);   
      } else {
        player = res.match(HIVE_CHATREPORT_PLAYER_REGEX)[0]
        console.log(`Chatreport loaded, Player: ${player}`);   
      }
      
      answers.report.addPlayer(player);

      nextQuestion(Questions.CATEGORY);
    }).catch(err => {
      console.error("\nError parsing ChatLog:\n", err);
      process.exit()
    });
  } else if (HIVE_GAMELOG_URL_REGEX.test(url)) {
    // Game log
    answers.report.evidence = url;
    answers.report.category = Categories.get('chat');

    fetch(url).then(res => res.text()).then(res => {
      [... new Set(res.match(HIVE_PLAYER_LINK_REGEX))].map(a => answers.report.addPlayer(a));
      return;
    })
      .then(_ => nextQuestion(Questions.PLAYERS_LIST));
  } else {
    console.log("Thats not a link I know what to do with...");
    answers.report.evidence = url;

    nextQuestion(Questions.PLAYERS);
  }
} else {
  nextQuestion(Questions.PLAYERS);
}
