
export class Reason {
  constructor(readonly id: string, readonly name: string = "") {
    this.name = name || id;
  }

  toChoice() {
    return {
      name: this.name,
      value: this,
      short: this.name
    }
  }
}