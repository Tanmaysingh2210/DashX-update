import "./Loader.css";

const Loader = ({ label = "Loading..." }) => (
  <div className="loader">
    <span className="loader__spinner" />
    <span className="body-md">{label}</span>
  </div>
);

export default Loader;