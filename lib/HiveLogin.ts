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
const HIVE_REPORT_LIST_REGEX = /([a-zA-Z0-9_ ,]*)<\/td>\n<td>([a-zA-t ()]{0,20})<\/td>\n<td>([a-zA-t]{0,20})<\/td>\n<td><a href="\/view\/([a-f0-9]{24})/g
const HIVE_REPORT_INFO_REGEX_ANSWERED = /Report against ([a-zA-Z0-9_, ]*) on \d\d\d\d-\d\d-\d\d \d\d?:\d\d:\d\d<\/h1>\nReport reason: (.*). <br><br>\nReport status: ([a-zA-Z]*)\n\.<br><br>\nReport comment: (.*)<br><br>\nHandled on: (\d\d\d\d-\d\d-\d\d \d\d?:\d\d:\d\d)<br><br>\nHandled by: ([a-zA-Z_0-9]{3,16})<br><br>\nStaff comment: (.*)<br>/
const HIVE_REPORT_INFO_REGEX_IS_PENDING = /Report status: Pending/
const HIVE_REPORT_INFO_REGEX_PENDING = /Report against ([a-zA-Z0-9_, ]*) on \d\d\d\d-\d\d-\d\d \d\d?:\d\d:\d\d<\/h1>\nReport reason: (.*). <br><br>\nReport status: ([a-zA-Z]*)\n\.<br><br>\nReport comment: (.*)<br><br>/

export async function getLatest10Reports(): Promise<SubmittedReport[]> {
  //todo: support for multiple players
  const [uuid, cookiekey] = await getUuidAndCookiekey();
  
  const reports = await fetch('https://report.hivemc.com/submitted', {
    headers: {
      cookie: `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`
    }
  })
  .then(res => res.text())
  .then(res => {
    let match;
    let result = [];
    
    // only way to get the capturing groups of all matches i know of...
    while ((match = HIVE_REPORT_LIST_REGEX.exec(res)) !== null) {
      result.push({
        names: match[1].match(/[a-zA-Z0-9_]{3,16}/g),
        reason: match[2],
        status: match[3],
        id: match[4],
      })
    }

    return result;
  })
  .then(res => res.map(({names: names, reason: reason, status: status, id: id}) => {
    let report = new SubmittedReport(id);
    report.players = new Set(names.map(name => new Player(name)));
    report.reason = reason;
    report.status = status;
    return report;
  }))
  .catch(err => {
    console.log(err)
    loginFailCounter++;
    return null;
  });
  
  if(reports){
    return reports;
  }else if (loginFailCounter <= 1) {
  //  conf.delete('uuid');
  //  conf.delete('cookiekey');

  //  return getLatest10Reports();
  } else {
   // throw new Error('Failed to login to the Hive...')
  }
}

export async function getReportInfo(report: SubmittedReport): Promise<SubmittedReport> {
  const [uuid, cookiekey] = await getUuidAndCookiekey();
  
  const updatedReport = await fetch(`https://report.hivemc.com/view/${report.id}`, {
    headers: {
      cookie: `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`
    }
  })
  .then(res => res.text())
  .then(res => {
    return res;
  })
  .then(res => {
    if (HIVE_REPORT_INFO_REGEX_IS_PENDING.test(res)){
      let match = HIVE_REPORT_INFO_REGEX_PENDING.exec(res);
      
      report.players = new Set(match[1].match(/[a-zA-Z0-9_]{3,16}/g).map(a => new Player(a)));
      report.reason = match[2] as any;
      report.status = match[3] as any;
      report.comment = match[4];
    }else {
      let match = HIVE_REPORT_INFO_REGEX_ANSWERED.exec(res);

      report.players = new Set(match[1].match(/[a-zA-Z0-9_]{3,16}/g).map(a => new Player(a)));
      report.reason = match[2] as any;
      report.status = match[3] as any;
      report.comment = match[4];
      report.handledAt = new Date(match[5])
      report.handledBy = new Player(match[6])
      report.staffComment = match[7];
    }
    
    return report;
  })
  .catch(err => {
    console.log(err)
    loginFailCounter++;
    return null;
  });
  
  if (updatedReport){
    return updatedReport;
  }else if (loginFailCounter <= 1) {
    conf.delete('uuid');
    conf.delete('cookiekey');

    return getReportInfo(report);
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