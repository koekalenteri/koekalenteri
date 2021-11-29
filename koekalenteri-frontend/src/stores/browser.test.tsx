import { fireEvent, render } from "@testing-library/react";
import { useLocalStorage, useSessionStorage } from "./browser";

function LocalTestComponent() {
  const [data, setData] = useLocalStorage("test", "useLocalStorage Default");
  return (
    <>
      <p data-testid="data">{data}</p>
      <button id="set-data" onClick={() => setData('useLocalStorage From Button')}>Change</button>
    </>
  );
}

function SessionTestComponent() {
  const [data, setData] = useSessionStorage("test", "useSessionStorage Default");
  return (
    <>
      <p data-testid="data">{data}</p>
      <button id="set-data" onClick={() => setData('useSessionStorage From Button')}>Change</button>
    </>
  );
}


function createStorageEvent(key: string, newValue: string | null, storage: Storage) {
  return new StorageEvent("storage", {
    newValue,
    key,
    oldValue: null,
    storageArea: storage
  });
}

[
  {
    name: 'useLocalStorage',
    Component: LocalTestComponent,
    storage: localStorage,
    otherStorage: sessionStorage,
  },
  {
    name: 'useSessionStorage',
    Component: SessionTestComponent,
    storage: sessionStorage,
    otherStorage: localStorage,
  }
].forEach(({name, Component, storage, otherStorage}) => {
  // eslint-disable-next-line jest/valid-title
  describe(name, () => {
    beforeEach(() => {
      storage.clear();
    });

    it('initializes default value', () => {
      const { getByTestId } = render(<Component />);
      expect(getByTestId('data')).toHaveTextContent(name + ' Default');
      expect(storage.getItem('test')).toEqual(name + ' Default');
    });

    it('reads previously set value', () => {
      storage.setItem('test', 'Stored Value');
      const { getByTestId } = render(<Component />);
      expect(getByTestId('data')).toHaveTextContent('Stored Value');
      expect(storage.getItem('test')).toEqual('Stored Value');
    });

    it('updates state and storage', () => {
      storage.setItem('test', 'Stored Value');
      const { getByTestId, getByRole } = render(<Component />);
      fireEvent.click(getByRole("button"));
      expect(getByTestId('data')).toHaveTextContent(name + ' From Button');
      expect(storage.getItem('test')).toEqual(name + ' From Button');
    });

    it('syncs data from other tab', () => {
      const { getByTestId } = render(<Component />);
      fireEvent(window, createStorageEvent("test", "Test Sync", storage));
      expect(getByTestId('data')).toHaveTextContent('Test Sync');
      expect(storage.getItem('test')).toEqual('Test Sync');
    });

    it('does not sync from different key', () => {
      const { getByTestId } = render(<Component />);
      fireEvent(window, createStorageEvent("test1", "Test Sync", storage));
      expect(getByTestId('data')).toHaveTextContent(name + ' Default');
      expect(storage.getItem('test')).toEqual(name + ' Default');
    });

    it('does not sync from different storage', () => {
      const { getByTestId } = render(<Component />);
      fireEvent(window, createStorageEvent("test", "Test Sync", otherStorage));
      expect(getByTestId('data')).toHaveTextContent(name + ' Default');
      expect(storage.getItem('test')).toEqual(name + ' Default');
    });
  });
});
