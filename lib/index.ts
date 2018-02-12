import * as inquirer from 'inquirer';
import { default as fetch } from 'node-fetch';
import * as urlencode from 'urlencode';
import { GameTypes, Player } from 'hive-api';
import * as FormData from 'form-data';
import * as request from 'request'
import { promisify } from 'util'
import * as Configstore from 'configstore';
import * as Rx from 'rxjs/Rx';

const conf = new Configstore('hive-report-cmd', {
  hive_login_link_regex: /https\:\/\/secure.hivemc.com\/directlogin\/\?UUID\=.*\&token=.*/
});

GameTypes.update();

enum Questions {
  LOGIN = 'login',
  PLAYERS = 'players',
  PLAYERS_LIST = 'players_list',
  CATEGORY = 'category',
  REASON = 'reason',
  EVIDENCE = 'evidence',
  COMMENT = 'comment'
};

const questionRegistry: Map<Questions, any> = new Map();

const prompts = new Rx.Subject();

const answers = {
  login: null,
  players: [],
  reason: null,
  category: null,
  evidence: null,
  comment: null
};

(inquirer.prompt((prompts as any)) as any).ui.process.subscribe(
  async ans => {
    switch (ans.name) {
      case Questions.LOGIN:
        answers.login = ans.answer;
        nextQuestion(Questions.PLAYERS);
        break;
      case Questions.PLAYERS:
        answers.players = await Promise.all(ans.answer.split(/ /g).map(p => new Player(p).info().then(i => i.uuid)));
        nextQuestion(Questions.CATEGORY);
        break;
      case Questions.CATEGORY:
        answers.category = ans.answer;
        nextQuestion(Questions.REASON);
        break;
      case Questions.REASON:
        answers.reason = ans.answer;
        nextQuestion(Questions.EVIDENCE);
        break;
      case Questions.EVIDENCE:
        answers.evidence = ans.answer;
        nextQuestion(Questions.COMMENT);
        break;
      case Questions.COMMENT:
        answers.comment = ans.answer;
        prompts.complete();
        break;
    }
  },
  err => console.error(err),
  async _ => {
    const [token, uuid, cookiekey] = await getReportToken(answers.login);

    await submitReport(token, uuid, cookiekey, answers.players, answers.category, answers.reason, answers.evidence, answers.comment);
  }
);

function nextQuestion(id: Questions) {
  prompts.next(questionRegistry.get(id));
}

questionRegistry.set(Questions.LOGIN, {
  type: 'input',
  name: Questions.LOGIN,
  message: 'Login Link:',
  validate: str => new RegExp(conf.get('hive_login_link_regex')).test(str)
});

questionRegistry.set(Questions.PLAYERS, {
  type: 'input',
  name: 'players',
  message: 'Players:',
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

questionRegistry.set(Questions.CATEGORY, {
  type: 'list',
  name: Questions.CATEGORY,
  message: 'Category:',
  choices: [
    'hacking',
    'chat',
    'behaviour'
  ]
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
  }
});

questionRegistry.set(Questions.EVIDENCE, {
  type: 'input',
  name: Questions.EVIDENCE,
  message: 'Evidence:',
  when: questions => !questions.players.includes('hivemc.com'),
  validate: (str) => {
    return str.length > 5;
  }
});

questionRegistry.set(Questions.COMMENT, {
  type: 'input',
  name: Questions.COMMENT,
  message: 'Comment:'
});

async function getReportToken(loginLink) {
  const [uuid, cookiekey] = await fetch(loginLink, {
    redirect: 'manual'
  }).then(res => {
    return [
      res.headers.get('set-cookie').match(/(?<=hive_UUID=)[a-f0-9]{32}/)[0],
      res.headers.get('set-cookie').match(/(?<=hive_cookiekey=)[A-Za-z0-9]{10}/)[0]
    ]
  });

  const token = await fetch('http://report.hivemc.com/', {
    headers: {
      cookie: `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`
    }
  })
    .then(res => res.text())
    .then(res => res.match(/(?<=_token: ")[a-zA-Z0-9]{40}(?=")/)[0])

  return [token, uuid, cookiekey];
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
      process.exit();
    }
  }).catch(err => console.error(err));
}

prompts.next(questionRegistry.get(Questions.LOGIN));
