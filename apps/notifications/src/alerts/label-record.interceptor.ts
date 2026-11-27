import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { CreateAlertInput } from './alert.inputs.js';

/** What the record of an alert label says it is. */
export const LABEL_RECORD = 'alert-label';

/**
 * Records a label as one structured record: the label is a field of the
 * record, with whatever it contains inside the value, so nothing it carries
 * can read as a line of the log. Applied where a label arrives.
 */
@Injectable()
export class LabelRecordInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LABEL_RECORD);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const input = context.getArgs().at(0);
    const label = (input as CreateAlertInput | undefined)?.label;
    if (typeof label === 'string') {
      this.logger.log(JSON.stringify({ record: LABEL_RECORD, label }));
    }
    return next.handle();
  }
}
