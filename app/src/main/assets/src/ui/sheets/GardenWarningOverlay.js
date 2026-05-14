function GardenWarningOverlay({ settings, setSettings, onCancel, onProceed }) {
  const selectedTier = getGardenTier(settings.gardenTier);
  return (/*#__PURE__*/
    React.createElement("div", { className: "garden-warning-overlay", onClick: onCancel }, /*#__PURE__*/
    React.createElement("div", { className: "garden-warning-modal", onClick: (e) => e.stopPropagation() }, /*#__PURE__*/
    React.createElement("div", { className: "garden-warning-title" }, "Before You Begin"), /*#__PURE__*/
    React.createElement("div", { className: "garden-warning-body" }, /*#__PURE__*/
    React.createElement("em", null, "A Return to The Garden"), " contains ", /*#__PURE__*/React.createElement("strong", null, "209 high-resolution photographs"), " totaling approximately ", /*#__PURE__*/React.createElement("strong", null, selectedTier.size), " at the selected quality. Pages stream from the internet as you read and are cached on your device.", /*#__PURE__*/
    React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "For the best experience, connect to ", /*#__PURE__*/
    React.createElement("strong", null, "Wi-Fi"), " before proceeding. Mobile data charges may apply otherwise.", /*#__PURE__*/
    React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), "Please also ensure your device has sufficient ", /*#__PURE__*/
    React.createElement("strong", null, "free storage"), " available to cache the full collection."
    ), /*#__PURE__*/
    React.createElement("div", { className: "garden-tier-selector" }, /*#__PURE__*/
    React.createElement("div", { className: "garden-tier-label" }, "Image Quality"), /*#__PURE__*/
    React.createElement("div", { className: "garden-tier-hint" }, "You can change this anytime from the Settings menu."),
    GARDEN_TIERS.map((t) => /*#__PURE__*/
    React.createElement("button", { key: t.id,
      className: `garden-tier-option${settings.gardenTier === t.id ? " selected" : ""}`,
      onClick: () => setSettings((s) => ({ ...s, gardenTier: t.id })) }, /*#__PURE__*/
    React.createElement("div", { className: "garden-tier-option-main" }, /*#__PURE__*/
    React.createElement("span", { className: "garden-tier-option-name" }, t.label), /*#__PURE__*/
    React.createElement("span", { className: "garden-tier-option-size" }, t.size)
    ), /*#__PURE__*/
    React.createElement("div", { className: "garden-tier-option-desc" }, t.res, " \xB7 ", t.desc)
    )
    )
    ), /*#__PURE__*/
    React.createElement("div", { className: "garden-warning-actions" }, /*#__PURE__*/
    React.createElement("button", { className: "garden-warning-btn garden-warning-btn-cancel",
      onClick: onCancel }, "Go Back"

    ), /*#__PURE__*/
    React.createElement("button", { className: "garden-warning-btn garden-warning-btn-proceed",
      onClick: onProceed }, "Proceed"

    )
    )
    )
    ));
}
