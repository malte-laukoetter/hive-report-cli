import { Player } from "hive-api";
import { Category } from "./Category";
import { Reason } from "./Reason";
import * as urlencode from 'urlencode';
import { default as fetch } from 'node-fetch';

export class Report {
  private _players: Set<Player | Promise<Player>> = new Set();
  private _category: Category | Promise<Category>;
  private _reason: Reason | Promise<Reason>;
  private _evidence: string | Promise<string>;
  private _comment: string | Promise<string>;

  addPlayer(player: string)
  addPlayer(player: Player | Promise<Player>)
  addPlayer(player: Player | string | Promise<Player>){
    if(typeof player === "string"){
      player = new Player(player);
    }

    this._players.add(player);
  }

  get players(): Set<Player | Promise<Player>>{
    return this._players;
  }

  set category(category: Category | Promise<Category>){
    this._category = category;
  }

  get category(): Category | Promise<Category>{
    return this._category;
  }

  set reason(reason: Reason | Promise<Reason>){
    this._reason = reason;
  }

  get reason(): Reason | Promise<Reason>{
    return this._reason;
  }

  set evidence(evidence: string | Promise<string>){
    this._evidence = evidence;
  }

  get evidence(): string | Promise<string>{
    return this._evidence;
  }

  set comment(comment: string | Promise<string>){
    this._comment = comment;
  }

  get comment(): string | Promise<string>{
    return this._comment;
  }

  async submit(token: string, uuid: string, cookiekey: string){
    const payload = await this.createPayload(token);
    
    return fetch('https://report.hivemc.com/ajax/receive', {
      method: 'POST',
      headers: {
        'Cookie': `hive_UUID=${uuid}; hive_cookiekey=${cookiekey}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': payload.length.toString(),
        'Host': 'report.hivemc.com',
        'Origin': 'http://report.hivemc.com',
        'Referer': 'http://report.hivemc.com/',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: payload
    })
  }

  uuids(): Promise<string[]>{
    return Promise.all([... this.players].map(async player => (await player).info().then(i => i.uuid)));
  }

  private async createPayload(token): Promise<string>{
    return Object.entries({
      category: (await this.category).id,
      reason: (await this.reason).id,
      comment: await this.comment,
      evidence: await this.evidence,
      UUIDs: await this.uuids(),
      notify: true,
      _token: token
    })
    // parse array elements to be expanded into multiple
    .reduce((arr, [key, val]) => {
      if (Array.isArray(val)) {
        val.forEach(val => {
          arr.push([`${key}[]`, val])
        });
      } else {
        arr.push([key, val])
      }
      return arr;
    }, [])
    // urlencode keys and vals
    .map(([key, val]) => [urlencode(key), urlencode(val)])
    // create string from them
    .map(([key, val]) => `${key}=${val}`)
    .join('&');
  }
}