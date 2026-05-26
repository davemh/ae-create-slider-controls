//////////////////////////////////////////////////
//                                              //
//  AE Create Slider Controls v1.9.1            //
//  (ScriptUI Panel)                            //
//                                              //
//////////////////////////////////////////////////
//         _                           _        //
//    by  | |                         | |       //
//      __| | __ ___   _____ _ __ ___ | |__     //
//     / _` |/ _` \ \ / / _ \ '_ ` _ \| '_ \    //
//    | (_| | (_| |\ V /  __/ | | | | | | | |   //
//     \__,_|\__,_| \_/ \___|_| |_| |_|_| |_|   //
//                                              //
//////////////////////////////////////////////////
//                                              //
//  Script UI panel only! Install via           //
//  File > Scripts > Install Script UI Panel... //
//                                              //
//  1. User selects layer property containing   //
//     the expression that needs controls.      //
//                                              //
//  2. Tool detects + lists all explicitly-     //
//     defined variables in the expression,     //
//     and allows the user to generate sliders  //
//     for keyframing them.                     //
//                                              //
//  3. Supports Slider-type Controls only.      //
//                                              //
//  4. Variables must be explicitly defined.    //
//                                              //
//////////////////////////////////////////////////

function createSliderControlsUI(thisObj) {
    var isPanel = (thisObj && thisObj instanceof Panel);
    var panel = isPanel ? thisObj : new Window("palette", "Slider Control Creator", undefined, {resizeable: true});

    // sizing / resize behavior
    try { panel.size = [560, 420]; } catch (e) {}
    try { panel.minimumSize = [400, 300]; } catch (e) {}
    if (!isPanel) {
        panel.center();
    } else {
        // ensure the host lays out children when docking
        panel.onResizing = panel.onResize = function () { this.layout.resize(); };
    }

    // Clear previous children if reusing a docked panel
    try {
        while (panel.children && panel.children.length) panel.remove(0);
    } catch (e) {}

    // UI elements
    panel.add("statictext", undefined, "Select Destination Layer:");
    var destinationLayerDropdown = panel.add("dropdownlist", undefined, []);
    destinationLayerDropdown.minimumSize = [300, 20];

    var refreshLayersButton = panel.add("button", undefined, "Refresh Layers");
    var analyzeButton = panel.add("button", undefined, "Analyze Selected Property");
    var variablesContainer = panel.add("panel", undefined, "Detected Variables");
    variablesContainer.orientation = "column";
    variablesContainer.alignChildren = ["left", "top"];
    try { variablesContainer.minimumSize = [520, 220]; } catch (e) {}
    var variablesList = variablesContainer.add("group", undefined);
    variablesList.orientation = "column";
    variablesList.alignChildren = ["left", "top"];
    try { variablesList.minimumSize = [500, 200]; } catch (e) {}
    var varCheckboxes = [];
    var createControlsButton = panel.add("button", undefined, "Create Controls");

    // Populate layer dropdown
    function populateLayerDropdown() {
        try {
            while (destinationLayerDropdown.items && destinationLayerDropdown.items.length) destinationLayerDropdown.remove(0);
        } catch (e) {}
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem) || !comp.layers) {
            destinationLayerDropdown.add("item", "<no comp open>");
            destinationLayerDropdown.selection = 0;
            return;
        }
        for (var i = 1; i <= comp.numLayers; i++) {
            try {
                destinationLayerDropdown.add("item", comp.layer(i).name);
            } catch (e) {
                destinationLayerDropdown.add("item", "Layer " + i);
            }
        }
        if (destinationLayerDropdown.items && destinationLayerDropdown.items.length > 0) {
            destinationLayerDropdown.selection = 0;
        }
    }

    refreshLayersButton.onClick = function() {
        populateLayerDropdown();
    };

    // Helpers reused from previous versions
    function getLayerNames() { return []; } // not used now

    function getSelectedLayer() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return null;
        try {
            var sel = comp.selectedLayers;
            return (sel && sel.length > 0) ? sel[0] : null;
        } catch (e) {
            return null;
        }
    }

    function getSelectedProperty(selectedLayer) {
        // Timeline selection first
        try {
            var selProps = app.project.activeItem.selectedProperties;
            if (selProps && selProps.length > 0) {
                var p = selProps[0];
                try {
                    if (typeof p.canSetExpression !== "undefined") {
                        if (p.canSetExpression && p.expressionEnabled) return p;
                    } else {
                        if (String(p.expression || "").replace(/\s/g, "").length > 0) return p;
                    }
                } catch (e) {
                    // fall through
                }
            }
        } catch (e) {}

        // Fallback: find first property on the layer that has an enabled expression
        function findPropertyWithExpression(propGroup) {
            if (!propGroup || !propGroup.numProperties) return null;
            for (var i = 1; i <= propGroup.numProperties; i++) {
                var p = propGroup.property(i);
                if (!p) continue;
                if (p.numProperties && p.numProperties > 0) {
                    var found = findPropertyWithExpression(p);
                    if (found) return found;
                } else {
                    try {
                        if (typeof p.canSetExpression !== "undefined") {
                            if (p.canSetExpression && p.expressionEnabled && String(p.expression || "").replace(/\s/g, "").length > 0) {
                                return p;
                            }
                        } else {
                            if (String(p.expression || "").replace(/\s/g, "").length > 0) {
                                return p;
                            }
                        }
                    } catch (e) { /* ignore */ }
                }
            }
            return null;
        }

        if (selectedLayer) {
            return findPropertyWithExpression(selectedLayer);
        }
        return null;
    }

    function analyzeExpression(expression) {
        var vars = [];
        if (!expression || !String(expression).replace(/\s/g, "").length) return vars;
        // Tolerant regex: var/let/const or plain assignments
        var pattern = /(?:\b(?:var|let|const)\b\s*)?([A-Za-z_\$][\w\$]*)\s*=\s*([^;]+)(?:;|$)/g;
        var m;
        while ((m = pattern.exec(expression)) !== null) {
            try {
                var name = m[1];
                var rawValue = String(m[2] || "").trim().replace(/[\r\n]+/g, " ").trim();
                if (name) vars.push({ name: name, value: rawValue });
            } catch (err) {}
        }
        return vars;
    }

    function updateVariableCheckboxes(variables) {
        try {
            while (variablesList.children && variablesList.children.length > 0) variablesList.remove(0);
        } catch (e) {}
        varCheckboxes = [];
        for (var i = 0; i < variables.length; i++) {
            var v = variables[i];
            var cb = variablesList.add("checkbox", undefined, v.name + " = " + v.value);
            cb.varValue = v;
            cb.value = true;
            varCheckboxes.push(cb);
        }
        try {
            variablesList.layout.layout(true);
            variablesContainer.layout.layout(true);
            panel.layout.layout(true);
        } catch (e) {}
    }

    function getCheckedVariables(checkboxes) {
        var checked = [];
        for (var i = 0; i < checkboxes.length; i++) {
            try {
                if (checkboxes[i].value && checkboxes[i].varValue) checked.push(checkboxes[i].varValue);
            } catch (e) {}
        }
        return checked;
    }

    // Modified: return the created slider effect (or null)
    function createSlider(destinationLayer, variable) {
        try {
            var effects = destinationLayer.property("ADBE Effect Parade");
            var sliderEffect = null;
            if (effects) {
                try { sliderEffect = effects.addProperty("ADBE Slider Control"); } catch (e) {}
            }
            if (!sliderEffect && destinationLayer.effect) {
                try { sliderEffect = destinationLayer.effect.addProperty("ADBE Slider Control"); } catch (e) {}
            }
            if (!sliderEffect) { alert("Could not add slider to: " + destinationLayer.name); return null; }
            // Name the effect (if AE disallows duplicate names, it will suffix)
            try { sliderEffect.name = variable.name; } catch (e) {}
            var defaultValue = parseFloat(variable.value) || 0;
            try {
                var sliderParam = sliderEffect.property(1);
                if (sliderParam && typeof sliderParam.setValue !== "undefined") sliderParam.setValue(defaultValue);
            } catch (e) {}
            return sliderEffect;
        } catch (e) { alert("Error creating slider: " + e.toString()); return null; }
    }

    // Populate layers initially
    populateLayerDropdown();

    // Analyze handler (uses current comp/layer when clicked)
    analyzeButton.onClick = function() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem) || !comp.layers) {
            alert("Open a composition and select a layer before analyzing.");
            return;
        }

        var selectedLayer = getSelectedLayer();
        if (!selectedLayer) {
            alert("Select a layer in the Timeline (highlight it) and/or select a property to analyze.");
            return;
        }

        var selectedProperty = getSelectedProperty(selectedLayer);
        if (!selectedProperty) {
            alert("No property with an enabled expression was found on the selected layer.");
            return;
        }

        var exprText = "";
        try { exprText = String(selectedProperty.expression || ""); } catch (e) { exprText = ""; }

        if (!exprText.replace(/\s/g, "").length) {
            alert("Selected property has no expression.");
            updateVariableCheckboxes([]);
            return;
        }

        var variables = analyzeExpression(exprText);
        if (!variables || variables.length === 0) {
            alert("No explicit variables found in the expression.");
            updateVariableCheckboxes([]);
            return;
        }

        updateVariableCheckboxes(variables);
    };

    // Create controls handler (now links variables back into the source expression)
    createControlsButton.onClick = function() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem) || !comp.layers) {
            alert("Open a composition and select a destination layer first.");
            return;
        }
        if (!destinationLayerDropdown.selection || !destinationLayerDropdown.selection.text || destinationLayerDropdown.selection.text === "<no comp open>") {
            alert("Choose a destination layer from the dropdown (Refresh Layers if needed).");
            return;
        }
        var destinationIndex = destinationLayerDropdown.selection.index + 1;
        var destinationLayer = comp.layer(destinationIndex);
        if (!destinationLayer) { alert("Invalid destination layer."); return; }

        var checkedVariables = getCheckedVariables(varCheckboxes);
        if (checkedVariables.length === 0) { alert("No variables selected."); return; }

        // Find the property we analyzed (attempt same selection/fallback logic)
        var sourceLayer = getSelectedLayer();
        var sourceProperty = sourceLayer ? getSelectedProperty(sourceLayer) : null;

        app.beginUndoGroup("Create Sliders and Link Variables");
        try {
            // Create sliders and build map of variable name -> slider reference string
            var mapping = {}; // name -> reference string
            for (var i = 0; i < checkedVariables.length; i++) {
                var v = checkedVariables[i];
                var sliderEffect = createSlider(destinationLayer, v);
                if (!sliderEffect) continue;
                // Build expression reference to the slider's "Slider" param
                var effName = "";
                try { effName = sliderEffect.name; } catch (e) { effName = v.name; }
                var layerNameEsc = destinationLayer.name.replace(/"/g, '\\"');
                var effNameEsc = effName.replace(/"/g, '\\"');
                var ref = 'thisComp.layer("' + layerNameEsc + '").effect("' + effNameEsc + '")("Slider")';
                mapping[v.name] = ref;
            }

            // If there is a sourceProperty to modify, update only the variable definitions
            if (sourceProperty) {
                try {
                    var expr = String(sourceProperty.expression || "");
                    var originalExpr = expr;

                    for (var name in mapping) {
                        if (!mapping.hasOwnProperty(name)) continue;
                        var refstr = mapping[name];

                        // Replace the RHS of the variable declaration with the slider reference,
                        // preserving any var/let/const keyword if present.
                        // Pattern matches: optional keyword, whitespace, name, optional spaces, =, any RHS (up to semicolon)
                        var nameEsc = name.replace(/([$^\\.*+?()[\]{}|])/g, "\\$1");
                        var declPattern = new RegExp('((?:\\b(?:var|let|const)\\b\\s*)?)' + nameEsc + '\\s*=\\s*[^;]+;?', 'g');

                        expr = expr.replace(declPattern, function(match, kw) {
                            // Ensure kw is a string (may be undefined)
                            if (!kw) kw = "";
                            // Keep a semicolon at end
                            return kw + name + ' = ' + refstr + ';';
                        });
                    }

                    // Clean up multiple blank lines that might have been created (but avoid removing the declarations)
                    expr = expr.replace(/^\s*[\r\n]+/gm, ''); // leading blank lines
                    expr = expr.replace(/[\r\n]{2,}/g, '\n'); // collapse multiple blank lines

                    // Only set expression if changes occurred
                    if (expr !== originalExpr) {
                        try { sourceProperty.expressionEnabled = true; } catch (e) {}
                        try { sourceProperty.expression = expr; } catch (e) {
                            alert("Failed to update source expression: " + (e && e.toString ? e.toString() : e));
                        }
                    }
                } catch (e) {
                    alert("Error linking variables into expression: " + (e && e.toString ? e.toString() : e));
                }
            } else {
                // No source property found — inform user that sliders were created but not linked
                alert("Sliders created, but no source property was found to link the variables. Select the property you analyzed before creating controls to enable automatic linking.");
            }
        } catch (e) { alert("Error creating sliders: " + (e && e.toString ? e.toString() : e)); }
        finally { app.endUndoGroup(); }
    };

    // show / layout depending on host
    if (panel instanceof Window) {
        try { panel.show(); } catch (e) { panel.layout.layout(true); }
    } else {
        try { panel.layout.layout(true); } catch (e) {}
    }

    return panel;
}

// If hosted as a dockable panel, pass 'this'; otherwise open a window
if (typeof this !== "undefined" && this instanceof Panel) {
    createSliderControlsUI(this);
} else {
    createSliderControlsUI();
}