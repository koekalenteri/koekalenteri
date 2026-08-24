const INVALID_NAME_CHARS = /[&/]/
// Characters that can occur inside a single name, so the conjunction is only matched as a whole
// word: "Öja", "Ja-Nette" and "Ja'far" are names, not two people.
const NAME_CHAR = String.raw`[\p{L}\p{M}\p{Nd}'’-]`
const AND_WORD = new RegExp(String.raw`(?<!${NAME_CHAR})ja(?!${NAME_CHAR})`, 'iu')

export const validName = (name: string): boolean => !INVALID_NAME_CHARS.test(name) && !AND_WORD.test(name)
