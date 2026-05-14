class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  render() {
    if (this.state.error) {
      return React.createElement("div", { style: { padding: '2rem', textAlign: 'center', color: '#ff4444' } },
        React.createElement("h2", null, "Something went wrong."),
        React.createElement("p", null, this.state.error.toString()),
        React.createElement("button", { onClick: () => window.location.reload() }, "Reload App")
      );
    }
    return this.props.children;
  }
}
