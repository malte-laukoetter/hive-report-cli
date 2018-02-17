import * as Configstore from 'configstore';
import * as Rx from 'rxjs/Rx';
import * as inquirer from 'inquirer';
import { default as fetch } from 'node-fetch';
import { SubmittedReport } from './SubmittedReport';
import { Player } from 'hive-api';

let loginFailCounter = 0;
const conf = new Configstore('hive-report-cmd');
const HIVE_LOGIN_LINK_REGEX = /https\:\/\/secure.hivemc.com\/directlogin\/\?UUID\=.*\&token=.*/;
const HIVE_REPORT_LIST_REPORTIDS_REGEX = /(?<=href=\"\/view\/)[a-f0-9]{24}/g;
const HIVE_REPORT_LIST_REGEX = /([a-zA-Z0-9_]{3,16})<\/td>\n<td>([a-zA-t ()]{0,20})<\/td>\n<td>([a-zA-t]{0,20})<\/td>\n<td><a href="\/view\/([a-f0-9]{24})/g

export async function getLatest10Reports(): Promise<SubmittedReport[]> {
  const [uuid, cookiekey] = await getUuidAndCookiekey();
  
  const reports = await fetch('https://report.hivemc.com/submitted', {
    headers: {
      cookie: `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`
    }
  })
  .then(res => res.text())
  .then(res => {
    return res;
  })
  .then(res => {
    let match;
    let result = [];

    // only way to get the capturing groups of all matches i know of...
    while ((match = HIVE_REPORT_LIST_REGEX.exec(res)) !== null) {
      result.push({
        name: match[1],
        reason: match[2],
        status: match[3],
        id: match[4],
      })
    }

    return result;
  })
  .then(res => res.map(({name: username, reason: reason, status: status, id: id}) => {
    let report = new SubmittedReport(id);
    report.players = new Set([new Player(username)]);
    report.reason = reason;
    report.status = status;
    return report;
  }))
  .catch(err => {
    loginFailCounter++;
    return null;
  });
  
  if(reports){
    return reports;
  }else if (loginFailCounter <= 1) {
    conf.delete('uuid');
    conf.delete('cookiekey');

    return getLatest10Reports();
  } else {
    throw new Error('Failed to login to the Hive...')
  }
}

async function getUuidAndCookiekey() {
  let uuid, cookiekey;

  if (conf.has('uuid') && conf.has('cookiekey')) {
    uuid = conf.get('uuid');
    cookiekey = conf.get('cookiekey');
  } else {
    [uuid, cookiekey] = await loginToHive();
  }

  return [uuid, cookiekey];
}

export async function getReportToken() {
  const [uuid, cookiekey] = await getUuidAndCookiekey();

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

  if (!token && loginFailCounter <= 1) {
    conf.delete('uuid');
    conf.delete('cookiekey');

    return getReportToken();
  } else if (loginFailCounter <= 1) {
    return [token, uuid, cookiekey];
  } else {
    throw new Error('Failed to login to the Hive...')
  }
}


async function loginToHive(): Promise<string[]> {
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
      err => reject(err)
    );
  });

  promptsLogin.next({
    type: 'input',
    name: 'login',
    message: 'Login Link:',
    validate: str => {
      return HIVE_LOGIN_LINK_REGEX.test(str);
    }
  });

  return returnValue;
}