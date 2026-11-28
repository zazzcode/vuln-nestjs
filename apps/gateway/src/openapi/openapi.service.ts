import {
  Injectable,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * The OpenAPI document of the whole edge, built once per application from the
 * routes that exist. `main.ts` and a test that wants the document call
 * `buildFor(app)` on the application they started; the three endpoints that
 * serve it read what was built.
 */
@Injectable()
export class OpenapiService {
  private document?: object;

  /** Builds the document from the application's own routes. Called once, after the routes exist. */
  buildFor(app: INestApplication): object {
    const config = new DocumentBuilder()
      .setTitle('VCX gateway')
      .setDescription('The one address a client of the lab uses.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    this.document = SwaggerModule.createDocument(app, config);
    return this.document;
  }

  /** The document, for the endpoints that serve it. */
  read(): object {
    if (!this.document) {
      throw new ServiceUnavailableException(
        'the API document has not been built',
      );
    }
    return this.document;
  }
}
