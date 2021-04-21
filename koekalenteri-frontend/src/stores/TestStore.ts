import { makeAutoObservable } from "mobx"

export interface ITest {
  id: number
  text: string
}

export class TestStore {
  public tests: ITest[] = [
    { id: 1, text: 'test 1' },
    { id: 2, text: 'test 2' }
  ];

  constructor() {
    makeAutoObservable(this)
  }
}
