import * as Configstore from 'configstore';
import * as commander from 'commander';
import { HiveLogin } from "./HiveLogin";
import { SubmittedReport } from "./SubmittedReport";
import { Player } from "hive-api";

/*
 * The filename is important for commander!
 */

const conf = new Configstore('hive-report-cmd');

const HIVE_REPORT_LIST_REPORTIDS_REGEX = /(?<=href=\"\/view\/)[a-f0-9]{24}/g;
const HIVE_REPORT_LIST_REGEX = /([a-zA-Z0-9_ ,]*)<\/td>\n<td>([a-zA-t ()]{0,20})<\/td>\n<td>([a-zA-t]{0,20})<\/td>\n<td><a href="\/view\/([a-f0-9]{24})/g

commander
  .description('lists the status of the latest 10 reports')
  .parse(process.argv);

async function main() {
  const login = new HiveLogin();

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

  // save the report ids to the config file
  const reportIds = conf.has('report_ids') ? new Set(conf.get('report_ids')) : new Set();
  reports.map(report => reportIds.add(report.id));
  conf.set('report_ids', [...reportIds].sort().reverse());

  // print the infos to the console
  reports.map(report => {
    console.log(`${report.submissionDate.toISOString().substr(0, 19).replace('T', ' ')} - ${report.status.padEnd(13)} (${report.reason}: ${[...report.players].map(pl => pl.name).join(', ')})`)
  });

  process.exit();  
}

main();