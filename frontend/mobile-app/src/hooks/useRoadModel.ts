import { Asset } from 'expo-asset';
import { useCallback, useEffect, useState } from 'react';
import { loadTensorflowModel, type ModelSource } from 'react-native-fast-tflite';

export type RoadModelState = 'IDLE' | 'LOADING' | 'LOADED' | 'ERROR';

type TensorflowModel = Awaited<ReturnType<typeof loadTensorflowModel>>;

const MODEL_ASSET = require('../src/assets/best.tflite');

export function useRoadModel() {
  const [model, setModel] = useState<TensorflowModel | null>(null);
  const [modelState, setModelState] = useState<RoadModelState>('LOADING');
  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadModel = async () => {
      try {
        setModelState('LOADING');
        setModelError(null);

        const asset = Asset.fromModule(MODEL_ASSET);
        await asset.downloadAsync();

        const localUri = asset.localUri ?? asset.uri;
        if (!localUri || !localUri.startsWith('file://')) {
          throw new Error(`Resolved model URI is not a local file: ${localUri ?? 'undefined'}`);
        }

        const loadedModel = await loadTensorflowModel({ url: localUri } as ModelSource, []);

        if (!isActive) {
          return;
        }

        setModel(loadedModel);
        setModelState('LOADED');
      } catch (error) {
        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Unable to load the road defect model.';
        console.warn('Model loader failed:', error);
        setModel(null);
        setModelState('ERROR');
        setModelError(message);
      }
    };

    void loadModel();

    return () => {
      isActive = false;
    };
  }, []);

  const runInference = useCallback(
    async (inputData: ArrayBuffer | Uint8Array) => {
      if (!model) {
        throw new Error(modelError ?? 'YOLOv8 model is missing or corrupted. Falling back to offline calculations.');
      }

      const source = inputData instanceof Uint8Array ? inputData : new Uint8Array(inputData);
      const cloned = new Uint8Array(source.length);
      cloned.set(source);
      const normalizedInput: ArrayBuffer = cloned.buffer;

      const outputs = model.runSync([normalizedInput]);
      return Array.isArray(outputs) ? outputs : [];
    },
    [model, modelError],
  );

  return {
    model,
    modelState,
    isModelReady: modelState === 'LOADED',
    hasModelAsset: modelState !== 'ERROR',
    modelError,
    runInference,
  };
}

export default useRoadModel;
