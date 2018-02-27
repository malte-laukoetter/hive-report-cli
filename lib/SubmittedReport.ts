import { Player } from "hive-api";
import { Category } from "./Category";
import { Reason } from "./Reason";
import { default as fetch } from 'node-fetch';
import { HiveLogin } from "./HiveLogin";

const HIVE_REPORT_INFO_REGEX_ANSWERED = /Report against ([a-zA-Z0-9_, ]*) on \d\d\d\d-\d\d-\d\d \d\d?:\d\d:\d\d<\/h1>\nReport reason: (.*). <br><br>\nReport status: ([a-zA-Z]*)\n\.<br><br>\nReport comment: (.*)<br><br>\nHandled on: (\d\d\d\d-\d\d-\d\d \d\d?:\d\d:\d\d)<br><br>\nHandled by: ([a-zA-Z_0-9]{3,16})<br><br>\nStaff comment: (.*)<br>/
const HIVE_REPORT_INFO_REGEX_IS_PENDING = /Report status: Pending/
const HIVE_REPORT_INFO_REGEX_PENDING = /Report against ([a-zA-Z0-9_, ]*) on \d\d\d\d-\d\d-\d\d \d\d?:\d\d:\d\d<\/h1>\nReport reason: (.*). <br><br>\nReport status: ([a-zA-Z]*)\n\.<br><br>\nReport comment: (.*)<br><br>/

export enum Status{
  PENDING = "PENDING",
  ACCEPTED = "Accepted",
  PARTIAL_DENIED = "PARTIAL_DENIED",
  DENIED = "DENIED"
}

export class SubmittedReport {
  private _players: Set<Player> = new Set();
  private _category: Category;
  private _reason: Reason;
  private _evidence: string;
  private _comment: string;
  private _status: Status;
  private _handledBy: Player;
  private _staffComment: string;
  private _handledAt: Date;
  public readonly submissionDate: Date;

  constructor(readonly id: string){
    this.submissionDate = new Date(parseInt(id.substr(0,8), 16)*1000);
  }

  set players(players: Set<Player>) {
    this._players = players;
  }

  get players(): Set<Player> {
    return this._players;
  }

  set category(category: Category) {
    this._category = category;
  }

  get category(): Category {
    return this._category;
  }

  set reason(reason: Reason) {
    this._reason = reason;
  }

  get reason(): Reason {
    return this._reason;
  }

  set evidence(evidence: string) {
    this._evidence = evidence;
  }

  get evidence(): string {
    return this._evidence;
  }

  set comment(comment: string) {
    this._comment = comment;
  }

  get comment(): string {
    return this._comment;
  }

  set status(status: Status) {
    this._status = status;
  }

  get status(): Status {
    return this._status;
  }

  set handledBy(handledBy: Player) {
    this._handledBy = handledBy;
  }

  get handledBy(): Player {
    return this._handledBy;
  }

  set staffComment(staffComment: string) {
    this._staffComment = staffComment;
  }

  get staffComment(): string {
    return this._staffComment;
  }

  set handledAt(handledAt: Date) {
    this._handledAt = handledAt;
  }

  get handledAt(): Date {
    return this._handledAt;
  }

  uuids(): Promise<string[]> {
    return Promise.all([... this.players].map(async player => (await player).info().then(i => i.uuid)));
  }

  load(login: HiveLogin): Promise<void> {
    return login.fetch(`https://report.hivemc.com/view/${this.id}`)
      .then(res => res.text())
      .then(res => {
        return res;
      })
      .then(res => {
        if (HIVE_REPORT_INFO_REGEX_IS_PENDING.test(res)) {
          let match = HIVE_REPORT_INFO_REGEX_PENDING.exec(res);

          this.players = new Set(match[1].match(/[a-zA-Z0-9_]{3,16}/g).map(a => new Player(a)));
          this.reason = match[2] as any;
          this.status = match[3] as any;
          this.comment = match[4];
        } else {
          let match = HIVE_REPORT_INFO_REGEX_ANSWERED.exec(res);

          this.players = new Set(match[1].match(/[a-zA-Z0-9_]{3,16}/g).map(a => new Player(a)));
          this.reason = match[2] as any;
          this.status = match[3] as any;
          this.comment = match[4];
          this.handledAt = new Date(match[5])
          this.handledBy = new Player(match[6])
          this.staffComment = match[7];
        }

        return;
      });
  }

  toSingleLineString(){
    return `${this.submissionDate.toISOString().substr(0, 19).replace('T', ' ')} - ${this.status.padEnd(13)} (${this.reason}: ${[...this.players].map(pl => pl.name).join(', ')})`;
  }
}