import http from './http';
import { Judge } from "koekalenteri-shared/model/Judge";

const PATH = '/judge/';

export async function getJudges() {
  return http.get<Array<Judge>>(PATH);
}
