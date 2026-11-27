import { Environment } from './environment.js';

describe('the origins an avatar may be fetched from', () => {
  test("the lab's own fake avatar host, when the variable is not set", () => {
    expect(new Environment().avatarOrigins).toEqual([
      'https://avatars.vcx.exchange',
    ]);
  });

  test('a comma-separated list: each origin trimmed, an empty one dropped', () => {
    const environment = new Environment();
    environment.AVATAR_ALLOWED_ORIGINS =
      ' http://127.0.0.1:4010 , https://avatars.vcx.exchange ,, ';

    expect(environment.avatarOrigins).toEqual([
      'http://127.0.0.1:4010',
      'https://avatars.vcx.exchange',
    ]);
  });
});
