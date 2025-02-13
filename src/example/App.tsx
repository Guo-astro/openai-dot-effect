import { DotEffectProcessor } from "@/lib/DotEffectProcessor";
import Header from "./Header";

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-800 transition-colors duration-300">
      <Header />
      <DotEffectProcessor />
    </div>
  );
}

export default App;
