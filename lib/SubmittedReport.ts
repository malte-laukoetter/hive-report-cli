import { Player } from "hive-api";
import { Category } from "./Category";
import { Reason } from "./Reason";
import { default as fetch } from 'node-fetch';

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

  uuids(): Promise<string[]> {
    return Promise.all([... this.players].map(async player => (await player).info().then(i => i.uuid)));
  }
}