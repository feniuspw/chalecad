/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { createEngineApi } from '../lib/engine/api';

Comlink.expose(createEngineApi());
