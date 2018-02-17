import { Reason } from "./Reason";

export class Categories {
  static readonly categories: Set<Category> = new Set();

  static register(category: Category){
    this.categories.add(category);
  }

  static get names(){
    return [... Categories.categories].map(a => a.name);
  }

  static asChoices(){
    return [...Categories.categories].map(category => category.toChoice());
  }

  static get(id: string){
    return [...Categories.categories].find(a => a.id === id)
  }
}

export class Category {
  readonly reasons: Set<Reason> = new Set();
  readonly name: string;
  private _allowedRegExp: Set<RegExp> = new Set();

  constructor(readonly id: string, name: string = ""){
    this.name = name || id;
  }

  registerReason(reason: Reason){
    this.reasons.add(reason);
  }

  reasonChoices(){
    return [... this.reasons].map(reason => reason.toChoice());
  }

  toChoice() {
    return {
      name: this.name,
      value: this,
      short: this.name
    }
  }
  
  get allowedRegExp(){
    return this._allowedRegExp;
  }
  
  set allowedRegExp(allowedRegExp: Set<RegExp> | RegExp[]){
    this._allowedRegExp.clear();
    [... allowedRegExp].forEach(regExp => this._allowedRegExp.add(regExp));
  }

  addAllowedRegExp(regexp: RegExp){
    this._allowedRegExp.add(regexp);
  }

  validate(evidence: string): boolean{
    return evidence.split(/\n/).every(line => [... this._allowedRegExp].some(regexp => regexp.test(line)))
  }
}

const categoryHacking = new Category('hacking', 'Hacking');
['speed', 'aimbot', 'dim', 'forcefield', 'flying', 'noswing', 'waterwalking', 'minimap', 'noknockback', 'killaura', 'noslowdown', 'movementemulator', 'teamhack', 'blink', 'xray', 'derp', 'fastplace']
  .forEach(a => categoryHacking.registerReason(new Reason(a)))
categoryHacking.addAllowedRegExp(/youtube\.com/)
categoryHacking.addAllowedRegExp(/youtu\.be/)
Categories.register(categoryHacking)

const categoryChat = new Category('chat', 'Chat');
['spamclean', 'spamdirty', 'porn', 'playerabuse', 'advertising', 'impersonating', 'foullanguage', 'trolling', 'racism', 'discrimination', 'ddos']
  .forEach(a => categoryChat.registerReason(new Reason(a)))
categoryChat.addAllowedRegExp(/hivemc\.com/)
Categories.register(categoryChat)

const categoryBehaviour = new Category('behaviour', 'Behaviour');
['premabuse', 'glitch', 'team', 'rdm', 'ghost', 'shardtrolling', 'skin', 'harass', 'teamkill', 'karma', 'inappropriatedrawing', 'name']
.forEach(a => categoryBehaviour.registerReason(new Reason(a)))
categoryBehaviour.addAllowedRegExp(/youtube\.com/)
categoryBehaviour.addAllowedRegExp(/youtu\.be/)
categoryBehaviour.addAllowedRegExp(/imgur\.com/)
Categories.register(categoryBehaviour)

