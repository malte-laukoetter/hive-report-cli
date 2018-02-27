import { HiveLogin } from "./HiveLogin";
import { Player } from "hive-api";
import { SubmittedReport } from "./SubmittedReport";
import * as Configstore from 'configstore';

const HIVE_REPORT_LIST_REPORTIDS_REGEX = /(?<=href=\"\/view\/)[a-f0-9]{24}/g;
const HIVE_REPORT_LIST_REGEX = /([a-zA-Z0-9_ ,]*)<\/td>\n<td>([a-zA-t ()]{0,20})<\/td>\n<td>([a-zA-t]{0,20})<\/td>\n<td><a href="\/view\/([a-f0-9]{24})/g

export async function reportList(login: HiveLogin): Promise<SubmittedReport[]>{
  const res = await login.fetch('https://report.hivemc.com/submitted').then(res => res.text());

  let match;
  let reports = [];

  // only way to get the capturing groups of all matches i know of...
  while ((match = HIVE_REPORT_LIST_REGEX.exec(res)) !== null) {
    const report = new SubmittedReport(match[4])

    report.players = new Set(match[1].match(/[a-zA-Z0-9_]{3,16}/g).map(name => new Player(name)));
    report.reason = match[2];
    report.status = match[3];

    reports.push(report);
  }

  return reports;
}

export function saveSubmittedReportsToConfig(reports: SubmittedReport[], conf: Configstore){
  // save the report ids to the config file
  const reportIds = conf.has('report_ids') ? new Set(conf.get('report_ids')) : new Set();
  reports.forEach(report => reportIds.add(report.id));
  conf.set('report_ids', [...reportIds].sort().reverse());

  // save the report infos also
  const reportInfos = conf.has('report_infos') ? conf.get('report_infos') : {};
  reports.forEach(report => reportInfos[report.id] = {
    players: [...report.players].map(player => player.uuid || player.name),
    reason: report.reason,
    status: report.status
  });
  conf.set('report_infos', reportInfos);
}

export function loadSubmittedReportsFromConfig(conf: Configstore): SubmittedReport[]{
  return Object.entries(conf.has('report_infos') ? conf.get('report_infos') : {}).map(([id, data]) => {
    const report = new SubmittedReport(id);

    report.players = data.players.map(p => new Player(p));
    report.reason = data.reason;
    report.status = data.status;

    return report;
  });
}