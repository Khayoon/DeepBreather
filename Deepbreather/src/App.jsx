import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
// import for ModalBox here.
import ModalBox from './components/ModalBox'

function App() {
  const [count, setCount] = useState(0)
  
  // state manager used to manage modal box.
  
  // This state manager you will see passed to ModalBox component as a prop.
  // Set to null by defualt to show no modal box.
  const [modal, mModal] = useState([]);
  
  return (
    <>
      <div>
        
        {/* modal box will be rendered here in vairbale modal. */}
        {modal}
        
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Deep Breather</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Start {count}
        </button>  
      </div>
      
      <button onClick={()=>{
          /* modal box is constructed with the following props:
              - display prop: used to pass in the state manager from this file into the Modal component to that it can destory/manage itself.  
              - heading prop: used to give the modal a heading. See ModalBox.js to modify.
              - content prop: used to give the modal basic content. See ModalBox.js to modify.
          */
          mModal( <ModalBox
            display={mModal}
            heading="I am a modal box."
            content="Put some content here."
          />);
        }}>Click me for Modal box</button>
    </>
  )
}

export default App
