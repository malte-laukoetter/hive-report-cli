import { ChoiceType } from "inquirer";


export class Reason {
  constructor(readonly id: string, readonly name: string = "") {
    this.name = name || id;
  }

  toChoice(): ChoiceType {
    return {
      name: this.name,
      value: this as any
    }
  }
}