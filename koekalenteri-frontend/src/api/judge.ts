import http from './http';
import { Judge } from "koekalenteri-shared";

const PATH = '/judge/';

export async function getJudges() {
  return http.get<Array<Judge>>(PATH);
}
