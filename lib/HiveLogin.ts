import * as Configstore from 'configstore';
import * as Rx from 'rxjs/Rx';
import * as inquirer from 'inquirer';
import {default as fetch} from 'node-fetch';
import {RequestInit, Request, Response} from 'node-fetch';
import * as pkginfo from 'pkginfo';

// saves version and name to module.exports
pkginfo(module, 'version', 'name');

const HIVE_LOGIN_LINK_REGEX = /https\:\/\/secure.hivemc.com\/directlogin\/\?UUID\=.*\&token=.*/;
const HIVE_LOGIN_REDIRECT_REGEX = /secure.hivemc.com\/login/;
const conf = new Configstore('hive-report-cmd');

export class HiveLogin {
  _uuid: string = null;
  _cookiekey: string = null;
  _loginLink: string = null;

  constructor(uuid: string, cookiekey: string)
  constructor(loginlink: string)
  constructor()
  constructor(uuidOrLoginLink: string = "", cookiekey: string = "") {
    if(cookiekey !== ""){
      this._uuid = uuidOrLoginLink;
      this._cookiekey = cookiekey;
    } else if(uuidOrLoginLink !== "") {
      this._loginLink = uuidOrLoginLink;
    } else {
      this._uuid = conf.get("uuid");
      this._cookiekey = conf.get("cookiekey");
    }
  }

  get uuid(): Promise<string> {
    if (this._uuid) return Promise.resolve(this._uuid);

    return this.loadUuidAndCookieKey().then(_ => this._uuid);
  }

  get cookieKey(): Promise<string> {
    if (this._cookiekey) return Promise.resolve(this._cookiekey);

    return this.loadUuidAndCookieKey().then(_ => this._cookiekey);
  }

  logout() {
    this._uuid = null;
    this._cookiekey = null;
    this._loginLink = null; 
  }

  private isLoading: boolean = false;
  private loadingPromise: Promise<void> = null
  loadUuidAndCookieKey(): Promise<void> {
    if(!this.isLoading){
      this.isLoading = true;

      if (this._loginLink) {
        this.loadingPromise = requestUuidAndCookieKey(this._loginLink)
          .then(({ uuid: uuid, cookiekey: cookiekey }) => {
            this._uuid = uuid;
            this._cookiekey = cookiekey;
          });
      } else {
        this.loadingPromise = loginLinkPrompt()
          .then(link => requestUuidAndCookieKey(link))
          .then(({ uuid: uuid, cookiekey: cookiekey }) => {
            this._uuid = uuid;
            this._cookiekey = cookiekey;
          });
      }
    }

    return this.loadingPromise.then(_ => {
      conf.set('cookiekey', this._cookiekey);
      conf.set('uuid', this._uuid);
      this.isLoading = false;
      return;
    })
  }

  async fetch(url: string | Request, init: RequestInit = {}, fetchTry: number = 0): Promise<Response> {
    const cookies = `hive_UUID=${await this.uuid}; hive_cookiekey=${await this.cookieKey};`;
    const additionalCookies: string = (init.headers ? (init.headers as any).cookie ? (init.headers as any).cookie : "" : "");

    // merge the init in such a way that we only add our cookies
    const mergedInit: RequestInit = {... init, ...{
      headers: {
        ... { userAgent: `${module.exports.name} (${module.exports.version})` },
        ... init.headers ? init.headers : {},
        ... {
          cookie: (cookies + additionalCookies)
        }
      } as any
    }};

    return fetch(url, mergedInit).then(async res => {
      if (HIVE_LOGIN_REDIRECT_REGEX.test(res.url)){
        this.logout();

        if(fetchTry > 2){
          return Promise.reject(new Error("Login to Hive failed too many times..."))
        } else {
          return this.fetch(url, init, fetchTry+1);
        }
      }

      return res;
    });
  }

  get reportToken(): Promise<string> {
    return this.fetch('http://report.hivemc.com/')
      .then(res => res.text())
      .then(res => res.match(/(?<=_token: ")[a-zA-Z0-9]{40}(?=")/)[0]);
  }
}


function loginLinkPrompt(): Promise<string>{
  const promptsLogin = new Rx.Subject();

  let returnValue: Promise<string> = new Promise((resolve, reject) => {

    (inquirer.prompt((promptsLogin as any)) as any).ui.process.subscribe(
      async ans => {
        promptsLogin.complete();

        resolve(ans.answer)
      },
      err => reject(err)
    );
  });

  promptsLogin.next({
    type: 'input',
    name: 'login',
    message: 'Login Link:',
    validate: str => {
      return HIVE_LOGIN_LINK_REGEX.test(str);
    }
  });

  return returnValue;
}

function requestUuidAndCookieKey(loginLink): Promise<{uuid: string, cookiekey: string}>{
  return fetch(loginLink, {
    redirect: 'manual'
  }).then(res => { return {
    uuid: res.headers.get('set-cookie').match(/(?<=hive_UUID=)[a-f0-9]{32}/)[0],
    cookiekey: res.headers.get('set-cookie').match(/(?<=hive_cookiekey=)[A-Za-z0-9]{10}/)[0]
  }});
}