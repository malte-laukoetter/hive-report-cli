import * as Configstore from 'configstore';
import * as commander from 'commander';
import { GameTypes } from 'hive-api';

const conf = new Configstore('hive-report-cmd');
GameTypes.update();

commander
  .command('report', 'creates a report', ({ isDefault: true } as any))
  .command('list', 'lists the status of the latest 10 reports').alias('l')
  .command('info', 'infos about a choosen report').alias('i')
  .command('settings', 'update some settings')
  .parse(process.argv);
