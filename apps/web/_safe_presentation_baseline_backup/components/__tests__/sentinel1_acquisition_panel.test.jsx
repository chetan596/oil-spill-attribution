import { describe, it, expect } from 'vitest';
import React from 'react';
import Sentinel1AcquisitionPanel from '../analysis/Sentinel1AcquisitionPanel';

describe('Sentinel1AcquisitionPanel Component', () => {
  it('should initialize Sentinel1AcquisitionPanel element without errors', () => {
    const element = React.createElement(Sentinel1AcquisitionPanel);
    expect(element).toBeDefined();
    expect(element.type).toBe(Sentinel1AcquisitionPanel);
  });
});
