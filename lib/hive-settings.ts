import * as commander from 'commander';
import * as Configstore from 'configstore';
import * as pkginfo from 'pkginfo';

/*
 * The filename is important for commander!
 */

pkginfo(module, 'name');
const conf = new Configstore(module.exports.name);

commander
  .description('update some settings')
  .option('--max-upload-speed <n>', 'sets the maximum speed for Youtube uploads in bytes/s', parseInt)
  .option('--video-dir <str>', 'sets the directory to search for videos for hacking reports')
  .parse(process.argv)

if (commander.maxUploadSpeed){
  conf.set('max_upload_speed', commander.maxUploadSpeed);
  console.log(`Max upload speed is now: ${commander.maxUploadSpeed}`);
}

if (commander.videoDir){
  conf.set('video_dir', commander.videoDir);
  console.log(`Video directory is now: ${commander.videoDir}`);
}

if (!commander.maxUploadSpeed && !commander.videoDir){
  console.log(`You need to set the settings with the flags, more information with --help`)
}