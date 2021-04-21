import { observer } from "mobx-react-lite"
import { useStores } from '../../use-stores';

const TestList = observer(() => {
  const { testStore } = useStores();

  return <ul>{testStore.tests.map(test => <li>{test.text}</li>)}</ul>
});

export default TestList;
