import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * The edge's last word on an error. What a caller reads is the status and the
 * reason an `HttpException` already carries; anything else is answered with a
 * status and nothing else, and its stack is logged, not returned.
 */
@Catch()
export class MaskedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MaskedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      void response.code(exception.getStatus()).send(exception.getResponse());
      return;
    }

    this.logger.error(
      exception instanceof Error
        ? `${exception.message}\n${exception.stack ?? ''}`
        : String(exception),
    );
    void response.code(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong',
    });
  }
}
