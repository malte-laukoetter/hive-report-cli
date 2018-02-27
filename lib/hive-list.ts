import * as Configstore from 'configstore';
import * as commander from 'commander';
import { HiveLogin } from "./HiveLogin";
import { SubmittedReport } from "./SubmittedReport";
import { Player } from "hive-api";
import * as pkginfo from 'pkginfo';
import { reportList, saveSubmittedReportsToConfig } from './ReportList';

/*
 * The filename is important for commander!
 */

pkginfo(module, 'name');
const conf = new Configstore(module.exports.name);

commander
  .description('lists the status of the latest 10 reports')
  .on('--help', _ => console.log(`
  
  Gets the latest 10 reports and there status and displays this infos as a table, may also request a login link as above. (showes the same information as https://report.hivemc.com/submitted)`
  ))
  .parse(process.argv);

async function main() {
  const login = new HiveLogin();

  const reports = await reportList(login);

  saveSubmittedReportsToConfig(reports, conf);

  // print the infos to the console
  reports.map(report => {
    console.log(report.toSingleLineString());
  });

  process.exit();  
}

main();