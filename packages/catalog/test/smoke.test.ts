import { expect, test } from 'vitest';
import { CATALOG_VERSION } from '../src/index';
test('catalog version', () => expect(CATALOG_VERSION).toMatch(/^\d+\.\d+\.\d+$/));
