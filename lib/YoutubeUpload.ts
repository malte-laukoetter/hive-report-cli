import * as fs from 'fs';
import * as readline from 'readline';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Throttle } from 'stream-throttle';
import { promisify, inspect } from 'util'
import * as path from 'path';
import * as Configstore from 'configstore';
import * as pkginfo from 'pkginfo';

const readFile = promisify(fs.readFile)

pkginfo(module, 'name');
const conf = new Configstore(module.exports.name);

export function uploadFile(filePath, afterAuthCallback) {
  return readFile(path.join(__dirname, '..', 'client_secret.json')).then(async content => {
    const auth = await authorize(JSON.parse(content.toString()));

    afterAuthCallback();

    return videosInsert(auth, filePath);
  });
}

function authorize(credentials) {
  const oauth2Client = new OAuth2Client(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    credentials.installed.redirect_uris[0]
  );

  // Check if we have previously stored a token.
  if (conf.has("oauth_google")) {
    oauth2Client.credentials = conf.get("oauth_google");
    return oauth2Client;
  } else {
    return getNewToken(oauth2Client);
  }
}

function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.force-ssl']
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question('Enter the code from that page here: ', code => {
      rl.close();

      resolve(oauth2Client.getToken(code).then(({ tokens }) => {
        oauth2Client.credentials = tokens;

        conf.set("oauth_google", tokens);

        resolve(oauth2Client);
      }).catch(err => console.log('Error while trying to retrieve access token', err)));
    });
  });
}

function videosInsert(auth, videoFileName) {
  const service = google.youtube({ version: 'v3', auth: auth });

  return promisify(service.videos.insert)({
    notifySubscribers: false,
    resource: {
      name: videoFileName,
      mimeType: 'video/*',
      snippet: {
        title: videoFileName.split(/(\/|\\)/g).reduce((_, a) => a, "").split('.')[0],
      },
      status: {
        privacyStatus: 'unlisted'
      }
    },
    media: {
      mimeType: 'video/*',
      body: fs.createReadStream(videoFileName).pipe(new Throttle({ rate: conf.get('max_upload_speed') }) as any)
    },
    part: "id,snippet,status"
  }).then(data => {
    return data.data;
  }).catch(err => {
    console.log("if the error is maxBodyLength -> edit node_modules/follow-redirects/index.js line 226 to something bigger")

    return err;
  });
}