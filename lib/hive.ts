#!/usr/bin/env node

import * as Configstore from 'configstore';
import * as commander from 'commander';
import { GameTypes } from 'hive-api';
import * as pkginfo from 'pkginfo';

pkginfo(module, 'name');
const conf = new Configstore(module.exports.name);
GameTypes.update();

commander
  .command('report', 'creates a report', ({ isDefault: true } as any))
  .command('list', 'lists the status of the latest 10 reports').alias('l')
  .command('info', 'infos about a choosen report').alias('i')
  .command('settings', 'update some settings')
  

commander
  .on('--help', _ => console.log(`
    
  If you are not logged in you need to get a link to login from the server when promptet.
  A link can be created by running /login report on hivemc.com and copying the link behind the text 'HERE'.`
  ))
  .parse(process.argv);
