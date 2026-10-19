/** Schema 1 is the first actual schema. No fictional legacy coercion. */
export function migrateCurrent<T extends {schemaVersion:number}>(input:T):T{
  const copy=structuredClone(input);if(copy.schemaVersion!==1)throw new Error('지원하지 않는 저장 버전이에요. 원본 파일을 보관해 주세요.');return copy;
}
