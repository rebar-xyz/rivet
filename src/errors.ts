export class RivetError extends Error {
  public code: string;
  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = 'RivetError';
  }
}

export class BroadcastError extends RivetError {
  constructor(
    message: string,
    public readonly txCode: number,
    public readonly rawLog: string,
    public readonly txHash?: string,
  ) {
    super(message, 'BROADCAST_ERROR');
    this.name = 'BroadcastError';
  }
}

export class SimulationError extends RivetError {
  constructor(message: string, public readonly rawLog: string) {
    super(message, 'SIMULATION_ERROR');
    this.name = 'SimulationError';
  }
}

export class AccountNotFoundError extends RivetError {
  constructor(public readonly address: string) {
    super(`Account not found: ${address}`, 'ACCOUNT_NOT_FOUND');
    this.name = 'AccountNotFoundError';
  }
}

export class RpcError extends RivetError {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly statusCode?: number,
  ) {
    super(message, 'RPC_ERROR');
    this.name = 'RpcError';
  }
}

export class InsufficientFundsError extends BroadcastError {
  constructor(rawLog: string, txHash?: string) {
    super(`Insufficient funds: ${rawLog}`, 5, rawLog, txHash);
    this.code = 'INSUFFICIENT_FUNDS';
    this.name = 'InsufficientFundsError';
  }
}

export class SequenceMismatchError extends BroadcastError {
  constructor(
    rawLog: string,
    public readonly expected: bigint,
    public readonly actual: bigint,
    txHash?: string,
  ) {
    super(`Sequence mismatch: expected ${expected}, got ${actual}`, 32, rawLog, txHash);
    this.code = 'SEQUENCE_MISMATCH';
    this.name = 'SequenceMismatchError';
  }
}

export class OutOfGasError extends BroadcastError {
  constructor(
    rawLog: string,
    public readonly gasUsed: bigint,
    public readonly gasWanted: bigint,
    txHash?: string,
  ) {
    super(`Out of gas: used ${gasUsed}, wanted ${gasWanted}`, 11, rawLog, txHash);
    this.code = 'OUT_OF_GAS';
    this.name = 'OutOfGasError';
  }
}

export class UnauthorizedError extends BroadcastError {
  constructor(rawLog: string, txHash?: string) {
    super(`Unauthorized: ${rawLog}`, 4, rawLog, txHash);
    this.code = 'UNAUTHORIZED';
    this.name = 'UnauthorizedError';
  }
}

export class TimeoutError extends BroadcastError {
  constructor(
    public readonly timeoutMs: number,
    txHash?: string,
  ) {
    super(
      `Transaction ${txHash ?? 'unknown'} was not included in a block within ${timeoutMs}ms`,
      -1,
      'timeout waiting for inclusion',
      txHash,
    );
    this.code = 'TIMEOUT';
    this.name = 'TimeoutError';
  }
}

export class SigningRejectedError extends RivetError {
  constructor(message = 'Signing request was rejected') {
    super(message, 'SIGNING_REJECTED');
    this.name = 'SigningRejectedError';
  }
}
