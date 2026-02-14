
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AlertSentry from '../src/components/AlertSentry';

// Mock EventSource
global.EventSource = vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    close: vi.fn(),
}));

test('renders AlertSentry without crashing', () => {
    render(<AlertSentry />);
    // AlertSentry doesn't render visible UI unless there's a toast, 
    // but we can check if it initializes the stream.
    expect(global.EventSource).toHaveBeenCalled();
});
