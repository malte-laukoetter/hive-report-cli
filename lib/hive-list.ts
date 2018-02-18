import { getLatest10Reports } from "./HiveLogin";
import * as Configstore from 'configstore';
import * as commander from 'commander';

const conf = new Configstore('hive-report-cmd');

commander
  .description('lists the status of the latest 10 reports')
  .parse(process.argv);

getLatest10Reports()
  .then(res => {
    // save the ids to the config
    const reports = conf.has('report_ids') ? new Set(conf.get('report_ids')) : new Set();
    res.map(report => reports.add(report.id));
    conf.set('report_ids', [...reports]);

    return res;
  })
  .then(res => {
    res.map(report => {
      console.log(`${report.submissionDate.toISOString().substr(0, 19).replace('T', ' ')} - ${report.status.padEnd(13)} (${report.reason}: ${[...report.players].map(pl => pl.name).join(', ')})`)
    });

    process.exit();
  });