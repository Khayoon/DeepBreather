// css styles for ModalBox can be found in modalBox.css.
import "./modalBox.css";

function ModalBox(props) {
  const modalBoxH = (
    <div className="modal">
      <div className="modal-content">
        <span
          id="modal-close"
          onClick={() => {
            // the display prop is the state manager that is passed in from app.js.
            // the state manager display prop will be used to collapse the current instance of ModalBox.
            props.display([]);
          }}
        >
          Close
        </span>
        {/* heading prop here */}
        <h3>{props.heading}</h3>
        <br />
        <br /> {/* content prop here */}
        <div className="text-center">{props.content}</div>
      </div>
    </div>
  );

  // return the component.
  return modalBoxH;
}

export default ModalBox;
