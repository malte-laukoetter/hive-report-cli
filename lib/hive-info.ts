import { getLatest10Reports } from "./HiveLogin";
import * as Configstore from 'configstore';
import * as commander from 'commander';
import * as inquirer from 'inquirer';
import { Html5Entities as Entities} from 'html-entities';
import { SubmittedReport } from "./SubmittedReport";

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
  await report.load();

  console.log(`Report: https://report.hivemc.com/view/${report.id}
  
Status: ${report.status}
Created at: ${report.submissionDate.toISOString().substr(0, 19).replace('T', ' ')}

Reported Players: ${[... report.players].map(p => p.name).join(', ')}
Reason: ${report.reason}
Comment: ${entities.decode(report.comment)}

Handled by: ${report.handledBy.name}
Handled on: ${report.handledAt.toISOString().substr(0, 19).replace('T', ' ')}
Staff Comment: ${entities.decode(report.staffComment)}`)

  process.exit();
});
