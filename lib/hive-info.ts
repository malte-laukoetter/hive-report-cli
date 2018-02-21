import * as Configstore from 'configstore';
import * as commander from 'commander';
import * as inquirer from 'inquirer';
import { Html5Entities as Entities} from 'html-entities';
import { SubmittedReport } from "./SubmittedReport";
import { HiveLogin } from "./HiveLogin";

/*
 * The filename is important for commander!
 */

const entities = new Entities()
const conf = new Configstore('hive-report-cmd');

commander
  .description('infos about a choosen report')
  .parse(process.argv);

inquirer.prompt({
  type: 'list',
  name: 'report',
  message: 'Report:',
  choices: _ => (conf.get('report_ids') as string[]).sort().reverse().map(id => new SubmittedReport(id)).map(report => { 
    return {
      value: report,
      name: `${report.submissionDate.toISOString().substr(0, 19).replace('T', ' ')} (${report.id})`,
      short: `${report.submissionDate.toISOString().substr(0, 19).replace('T', ' ')} (${report.id})`
    }
  }) as any
})
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
