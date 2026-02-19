
import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AlertSentry from '../src/components/AlertSentry';

// Mock EventSource
const eventSourceSpy = vi.fn();
class MockEventSource {
    url: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    addEventListener = vi.fn();
    close = vi.fn();

    constructor(url: string) {
        this.url = url;
        eventSourceSpy(url);
    }
}

vi.stubGlobal('EventSource', MockEventSource);

test('renders AlertSentry without crashing', () => {
    render(<AlertSentry />);
    // AlertSentry doesn't render visible UI unless there's a toast, 
    // but we can check if it initializes the stream.
    expect(eventSourceSpy).toHaveBeenCalledWith('/api/alerts/stream');
});
