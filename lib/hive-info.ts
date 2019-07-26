import * as Configstore from 'configstore';
import * as commander from 'commander';
import * as inquirer from 'inquirer';
import { Html5Entities as Entities} from 'html-entities';
import * as pkginfo from 'pkginfo';
import { SubmittedReport } from "./SubmittedReport";
import { HiveLogin } from "./HiveLogin";
import { reportList, saveSubmittedReportsToConfig, loadSubmittedReportsFromConfig } from './ReportList';

/*
 * The filename is important for commander!
 */

const entities = new Entities()

pkginfo(module, 'name');
const conf = new Configstore(module.exports.name);

commander
  .description('infos about a choosen report')
  .option('-u, --update', 'update the list of reports from the report site')
  .option('--ids', 'show the report ids instead of the infos in the selection')
  .on('--help', _ => console.log(`
  
  Provides a list of all known reports (can be updatet by running with the flag '--update') and allowes to select one of those and then fetches the available informations about the report. (showes the same information as report.hivemc.com/view/CHATREPORTID)`
  ))
  .parse(process.argv);

inquirer.prompt({
  type: 'list',
  name: 'report',
  message: 'Report:',
  choices: async _ => {
    if(commander.update){
      const login = new HiveLogin();

      console.log("Updateing Report List...")

      const reports = await reportList(login);

      saveSubmittedReportsToConfig(reports, conf);
    }
    
    if(commander.ids){
      const reports: SubmittedReport[] = (conf.get('report_ids') || []).map(id => new SubmittedReport(id));

      return reports.sort((a, b) => b.submissionDate.getTime() - a.submissionDate.getTime()).map(report => {
        return {
          value: report,
          name: report.id,
          short: report.id
        }
      });
    }else{
      const reports = loadSubmittedReportsFromConfig(conf)

      return reports.sort((a, b) => b.submissionDate.getTime() - a.submissionDate.getTime()).map(report => {
        return {
          value: report,
          name: report.toSingleLineString(),
          short: report.toSingleLineString()
        }
      });
    }
  }
} as any)
.then(async ans => {
  const report: SubmittedReport = ans.report;
  const login = new HiveLogin();
  await report.load(login);

  console.log(`Report: https://report.hivemc.com/view/${report.id}`)
  console.log();
  if (report.status)         console.log(`Status: ${report.status}`);
  if (report.submissionDate) console.log(`Created at: ${report.submissionDate.toISOString().substr(0, 19).replace('T', ' ')}`);
  console.log();
  if (report.players) console.log(`Reported Players: ${[...report.players].map(p => p.name).join(', ')}`);
  if (report.reason)  console.log(`Reason: ${report.reason}`);
  if (report.comment) console.log(`Comment: ${entities.decode(report.comment)}`);
  if (report.handledBy || report.handledAt || report.staffComment) console.log();
  if (report.handledBy)    console.log(`Handled by: ${report.handledBy.name}`)
  if (report.handledAt)    console.log(`Handled on: ${report.handledAt.toISOString().substr(0, 19).replace('T', ' ')}`)
  if (report.staffComment) console.log(`Staff Comment: ${entities.decode(report.staffComment)}`)

  process.exit();
});
