import type { QueryClient } from '../types.js';
import { SimulateRequest, SimulateResponse } from '../proto/abci.js';
import type { Result } from '../proto/abci.js';
import { SimulationError } from '../errors.js';

/** Result of a successful transaction simulation */
export interface SimulationResult {
  gasUsed: bigint;
  gasWanted: bigint;
  result?: Result;
}

/**
 * Simulate a transaction to estimate gas usage.
 * Uses ABCI query to /cosmos.tx.v1beta1.Service/Simulate
 */
export async function simulateTx(client: QueryClient, txBytes: Uint8Array): Promise<SimulationResult> {
  const requestBytes = SimulateRequest.encode(txBytes);

  let responseBytes: Uint8Array;
  try {
    responseBytes = await client.query(
      '/cosmos.tx.v1beta1.Service/Simulate',
      requestBytes,
    );
  } catch (err) {
    throw new SimulationError(
      `Simulation failed: ${err}`,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (responseBytes.length === 0) {
    throw new SimulationError('Simulation returned empty response', '');
  }

  const response = SimulateResponse.decode(responseBytes);
  if (!response.gasInfo) {
    throw new SimulationError('Simulation response missing gas info', '');
  }

  if (response.gasInfo.gasUsed <= 0n) {
    const log = response.result?.log ?? '';
    throw new SimulationError(
      `Simulation returned zero gas${log ? `: ${log}` : ' (no log available)'}`,
      log,
    );
  }

  return {
    gasUsed: response.gasInfo.gasUsed,
    gasWanted: response.gasInfo.gasWanted,
    result: response.result,
  };
}
