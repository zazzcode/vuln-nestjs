import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

/** What the record of an alert label says it is. */
export const LABEL_RECORD = 'alert-label';

/** The label of a call, whichever argument position carried it. */
export function labelOfCall(context: ExecutionContext): string | undefined {
  const holders = context.getArgs().flatMap((argument) => {
    if (typeof argument !== 'object' || argument === null) {
      return [];
    }
    const record = argument as { label?: unknown; input?: { label?: unknown } };
    return [record, record.input].filter(
      (candidate): candidate is { label: unknown } => candidate !== undefined,
    );
  });
  for (const holder of holders) {
    if (typeof holder.label === 'string') {
      return holder.label;
    }
  }
  return undefined;
}

/**
 * Records a label as one structured record: the label is a field of the
 * record, with whatever it contains inside the value, so nothing it carries
 * can read as a line of the log. Applied where a label arrives.
 */
@Injectable()
export class LabelRecordInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LABEL_RECORD);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const label = labelOfCall(context);
    if (label !== undefined) {
      this.logger.log(JSON.stringify({ record: LABEL_RECORD, label }));
    }
    return next.handle();
  }
}
