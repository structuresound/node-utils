import { assert } from 'chai';
import { select, cascadeShallow, cascade } from '../src';

const keywords = [
  'win',
  'mac',
  'linux',
  'ios',
  'android',
  'x64',
  'x86',
  'simulator',
  'clang',
  'gcc',
  'clion'
];

const testAObject = {
  useAccel: 0,
  'win, linux': {
    useAccel: 1,
    x86: {
      useAccel: 2
    },
    x64: {
      useAccel: 3
    }
  },
  'mac, ios': {
    useAccel: 4,
    x86: {
      useAccel: 5
    },
    x64: {
      useAccel: 6
    }
  }
};

const testASelectors = [
  [
    'mac', 'x64'
  ],
  ['win'],
  ['win', 'x64']
];

const testAExpected = [
  {
    useAccel: 6
  }, {
    useAccel: 1
  }, {
    useAccel: 3
  }
];

const testObjB = {
  'mac, ios': {
    flag: true
  },
  other: 'setting',
  build: {
    with: 'error A',
    'mac, ios': {
      sources: ['apple.c']
    },
    'mac': {
      with: 'cmake'
    }
  },
  'x64': {
    build: {
      with: 'error C',
      'mac': {
        with: 'ninja',
        clion: {
          with: 'cmake'
        }
      }
    }
  },
  'win': {
    build: {
      with: {
        'x64': 'clang',
        'x86': 'gcc'
      }
    }
  }
};

const testBSelectors = [
  [
    'mac', 'x64'
  ],
  [
    'mac', 'x64', 'clion'
  ],
  ['win'],
  ['win', 'x64']
];

const testBExpected = [
  {
    flag: true,
    other: 'setting',
    build: {
      with: 'ninja',
      sources: ['apple.c']
    }
  }, {
    flag: true,
    other: 'setting',
    build: {
      with: 'cmake',
      sources: ['apple.c']
    }
  }, {
    build: {
      with: 'error A'
    },
    other: 'setting'
  }, {
    build: {
      with: 'clang'
    },
    other: 'setting'
  }
];

const testObjC = {
  clang: {
    ios: {
      arch: 'arm64'
    },
    arch: 'x86'
  }
};

const testCSelectors = [
  [
    'ios', 'clang'
  ],
  ['linux', 'gcc']
];

const testCExpected = [
  {
    arch: 'arm64'
  }, {}
];

describe('select', () => {
  it('matches', () => {
    assert.ok(select(['apple'], 'apple'));
  });
  it('matches OR', () => {
    assert.ok(select([
      'ios', 'mac', 'win'
    ], 'x86, mac, win'));
  });
  it('matches AND', () => {
    assert.ok(select([
      'apple', 'bananna'
    ], 'apple bananna'));
  });
  it('fails', () => {
    assert.ok(!select([
      'apple', 'bananna'
    ], 'x86'));
  });
  it('fails AND', () => {
    assert.ok(!select(['apple'], 'apple bananna'));
  });
  it('fails OR/AND', () => {
    assert.ok(!select(['bananna'], 'apple, bananna orange'));
  });
});

describe('cascade', () => {
  it(`merges arrays`, () => {
    const conf = {
      sources: ['main.c'],
      mac: {
        sources: ['mac.c']
      }
    }
    const result = cascade(conf, ['mac'], ['mac']);
    const expected = {
      sources: ['main.c', 'mac.c']
    }
    assert.deepEqual(result, expected);
  });
  it(`merges objects, more specific selector wins`, () => {
    const conf = {
      build: {
        with: 'ninja',
        sources: {
          "mac x64": ['main.c'],
          mac: ['mac.c'],
        }
      },
      x64: {
        build: {
          sources: {
            mac: ['x64.c']
          }
        }
      }
    }
    const result = cascade(conf, ['mac', 'x64'], ['mac', 'x64']);
    const expected = {
      build: {
        with: 'ninja',
        sources: ['main.c', 'x64.c']
      }
    }
    assert.deepEqual(result, expected);
  });
  for (const i in testASelectors) {
    it(`selects A${i} ${testASelectors[i]}`, () => {
      const result = cascadeShallow(testAObject, keywords, testASelectors[i]);
      assert.deepEqual(result, testAExpected[i]);
    });
  }
  for (const i in testBSelectors) {
    it(`selects B${i} ${testBSelectors[i]}`, () => {
      const result = cascade(testObjB, keywords, testBSelectors[i]);
      assert.deepEqual(result, testBExpected[i]);
    });
  }
  for (const i in testCSelectors) {
    it(`selects C${i} ${testCSelectors[i]}`, () => {
      const result = cascadeShallow(testObjC, keywords, testCSelectors[i]);
      assert.deepEqual(result, testCExpected[i]);
    });
  }
});
