export type DomainErrorCode =
  | 'INVALID_FRACTION' | 'NON_CANONICAL_FRACTION' | 'UNSAFE_INTEGER'
  | 'UNSUPPORTED_RATIONAL_DURATION' | 'UNSUPPORTED_MVP_DURATION'
  | 'INVALID_METER' | 'UNSUPPORTED_MVP_METER' | 'INVALID_TEMPO'
  | 'E_SCHEMA' | 'E_OVERFLOW' | 'E_OVERLAP' | 'E_LOCKED' | 'E_GAP'
  | 'E_PALETTE' | 'E_INVENTORY' | 'E_FIRST_KIND' | 'E_REST_POSITION'
  | 'E_ONSET' | 'E_DURATION' | 'E_SAME_RHYTHM' | 'E_EXPLANATION';

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export type Diagnostic = {
  code: DomainErrorCode;
  message: string;
  conditionId?: string;
  eventIds?: string[];
  spans?: { startTick: number; endTick: number }[];
};

export const ERROR_MESSAGES: Partial<Record<DomainErrorCode, string>> = {
  E_SCHEMA: '리듬 데이터 형식을 확인할 수 없어 제출을 멈췄어요.',
  E_OVERFLOW: '조각이 한 마디 끝을 넘어가요.',
  E_OVERLAP: '두 조각이 같은 시간을 쓰고 있어요.',
  E_LOCKED: '이번에는 이 조각을 그대로 두어요.',
  E_GAP: '아직 정하지 않은 반 박이 있어요.',
  E_PALETTE: '이번 주문에서 사용할 수 있는 재료를 골라 주세요.',
  E_INVENTORY: '이번 주문의 재료 수를 확인해 주세요.',
  E_FIRST_KIND: '이번 주문에는 첫 박을 소리로 시작한다는 조건도 있어요.',
  E_REST_POSITION: '쉼의 길이는 맞아요. 위치를 들어 보세요.',
  E_ONSET: '소리가 시작하는 위치를 모델과 비교해 보세요.',
  E_DURATION: '시작은 맞아요. 소리가 이어지는 길이를 살펴보세요.',
  E_SAME_RHYTHM: '원래와 같은 리듬이에요. 쉼의 자리를 바꿔 보세요.',
  E_EXPLANATION: '설명 질문의 답과 근거를 함께 확인해 주세요.',
};

export function diagnostic(code: DomainErrorCode, details: Omit<Diagnostic, 'code' | 'message'> = {}, message?: string): Diagnostic {
  return { code, message: message ?? ERROR_MESSAGES[code] ?? code, ...details };
}
