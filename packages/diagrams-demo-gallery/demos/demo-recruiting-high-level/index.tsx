import createEngine, { DiagramModel, DefaultNodeModel, DefaultLinkModel, DefaultPortModel, LinkModel, DiagramEngine, RightAngleLinkModel, RightAngleLinkFactory, PointModel, DefaultLinkModelOptions } from '@projectstorm/react-diagrams';
import * as React from 'react';
import { CanvasWidget, AbstractModelFactory } from '@projectstorm/react-canvas-core';
import { DemoCanvasWidget } from '../helpers/DemoCanvasWidget';
import { Point } from '@projectstorm/geometry';
import { action } from '@storybook/addon-actions';

class Ref {
	public toNamespace: string;
	public toTable: string;
	public toColumn: string;

	public relationship?: string;
	public fromPort?: DefaultPortModel;
	public link?: DefaultLinkModel;

	constructor(namespace: string, table: string, column: string) {
		this.toNamespace = namespace;
		this.toTable = table;
		this.toColumn = column;
	}

	public setFromPort(fromPort: DefaultPortModel): Ref {
		this.fromPort = fromPort;

		return this;
	}

	public setRelationship(relationship: string): Ref {
		this.relationship = relationship;

		return this;
	}

	public setLink(link: DefaultLinkModel) : Ref {
		this.link = link;

		return this;
	}

	public static from(namespace: string, table: string, column: string) {
		return new Ref(namespace, table, column);
	}

	public static fromFulllyQualified(fullyQualifiedName: string) {
		const splits = fullyQualifiedName.split(".");
		if(splits.length !== 3) {
			console.log(splits);
			throw new Error(`A fully qualified name ${fullyQualifiedName} should have <namespace>.<table>.<column> format`);
		}


		return Ref.from(splits[0], splits[1], splits[2]);
	}

	public toString(): string {
		return `${this.toNamespace}.${this.toTable}.${this.toColumn}`;
	}
}

class Table {
	public name: string;
	public node: DefaultNodeModel;
	public primaryKeys: Map<string, DefaultPortModel> = new Map();
	public foreignKeys: Map<string, Ref> = new Map();
	public columns: Map<string, DefaultPortModel> = new Map();

	constructor(name: string, node: DefaultNodeModel) {
		this.name = name;
		this.node = node;
	}

	addPrimaryKey(name: string) {
		const port = this.node.addPort(new RightAnglePortModel(true, name, name));
		this.primaryKeys.set(name, port);
	}

	addForeignKey(name: string, ref: Ref, relationship?: string) {
		const port = this.node.addPort(new RightAnglePortModel(true, name, name));

		ref.setFromPort(port);

		if(relationship) {
			ref.setRelationship(relationship);
		}

		this.foreignKeys.set(name, ref);
	}

	addColumn(name: string) {
		const port = this.node.addPort(new RightAnglePortModel(true, name, name));
		this.columns.set(name, port);
	}
}

class Namespace {
	public name: string;
	public tables: Map<string, Table> = new Map();

	constructor(name: string) {
		this.name = name;
	}

	addTable(table: Table) {
		if(this.tables.has(table.name)) {
			console.warn(`Adding a table ${table.name} will overwrite existing table in namespace ${this.name}`);
		}

		this.tables.set(table.name, table);
	}
}

class Diagram {
	public name: string;
	private namespaces: Map<string, Namespace> = new Map();

	constructor(name: string) {
		this.name = name;
	}

	addNamespace(namespace: Namespace) {
		if(this.namespaces.has(namespace.name)) {
			console.warn(`Adding a namespace ${namespace.name} will overwrite existing namespace in diagram ${this.name}`);
		}

		this.namespaces.set(namespace.name, namespace);
	}

	/**
	 * Finalize all the foreign keys and various component to make the diagram and draw them out to the world
	 *
	 * Any missing foreign key connections and typos will throw an error here.
	 */
	finalize(engine: DiagramEngine): DiagramModel {
		const diagramModel = new DiagramModel();

		engine.getLinkFactories().registerFactory(new RightAngleLinkFactory());

		this.namespaces.forEach(n => n.tables.forEach(t => {
			// add table nodes
			diagramModel.addNode(t.node);
			console.log(`Table ${t.name} is added to diagram`);

			// add foreign key nodes
			t.foreignKeys.forEach((ref, name) => {
				if(!this.namespaces.has(ref.toNamespace)) {
					throw new Error(`Incorrect namespace ${ref.toNamespace} from foreign key ref ${ref} for table ${n.name}.${t.name}`)
				}

				if(!this.namespaces.get(ref.toNamespace).tables.has(ref.toTable)) {
					throw new Error(`Incorrect table ${ref.toTable} from foreign key ref ${ref} for table ${n.name}.${t.name}`)
				}

				const table = this.namespaces.get(ref.toNamespace).tables.get(ref.toTable);
				const existInPrimary = table.primaryKeys.has(ref.toColumn);
				const existInForeign = table.foreignKeys.has(ref.toColumn);
				const existInColumn = table.columns.has(ref.toColumn);

				let toPort;

				if(!existInPrimary) {
					if(!existInForeign) {
						if(!existInColumn) {
							throw new Error(`Incorrect column ${ref.toColumn} from foreign key ` +
								`ref ${ref.toString()} for table ${n.name}.${t.name}`);
						} else {
							console.warn(`Foreign key ${ref.toString()} references a normal column ${ref.toColumn} ` +
								`instead of a primary key on table ${n.name}.${t.name}`);

							toPort = table.columns.get(ref.toColumn);
						}
					} else {
						console.warn(`Foreign key ${ref.toString()} references a foreign key ${ref.toColumn} ` +
							`instead of a primary key on table ${n.name}.${t.name}`);

						toPort = table.foreignKeys.get(ref.toColumn);
					}
				} else {
					toPort = table.primaryKeys.get(ref.toColumn);
				}

				// establish the link
				const link = ref.fromPort.link<RefRightAngleLinkModel>(toPort);

				ref.setLink(link);
				link.setRef(ref);

				if(ref.relationship) {
					link.addLabel(ref.relationship);
				}

				diagramModel.addLink(link);
			});
		}));

		// diagramModel.getModels().forEach(item => {
		// 	item.registerListener({
		// 		eventDidFire: (e) => {
		// 			if(e.function == "positionChanged") {
		// 				console.log(`table moved [${e.entity.position.x}, ${e.entity.position.y}]`);
		// 			} else if (e.function == "selectionChanged" && e.entity instanceof RefRightAngleLinkModel) {
		// 				console.log("link moved", e.entity.points, e.entity.ref);
		// 				var schema = loadSchema(this.name);
		// 			} else {
		// 				console.log(e.function);
		// 			}
		// 		}
		// 	});
		// });

		// diagramModel.registerListener({
		// 	nodesUpdated: (e) => console.log("nodesUpdated"),
		// 	linksUpdate: (e) => console.log("linksUpdated"),
		// 	offsetUpdated: (e) => console.log("offsetsUpdated"),
		// 	zoomUpdated: (e) => console.log("zoomUpdated"),
		// 	gridUpdated: (e) => console.log("gridUpdated"),
		// 	selectionChanged: (e) => console.log("selectionUpdated"),
		// 	entityRemoved: (e) => console.log("entityUpdated"),
		// });

		return diagramModel;
	}

}

class RefRightAngleLinkModel extends RightAngleLinkModel {
	public ref : Ref;

	private pointsLastPositions: Map<string, Point> = new Map();

	constructor(options: DefaultLinkModelOptions = {}) {
		super(options);

		this.registerEventListeners();
	}

	registerEventListeners() {
		var _this = this;

		this.registerListener({
			pointAdded: function(e) {
				e.pointModel.registerListener({
					positionChanged: function(e) {
						const point: PointModel = e.entity;
						const prevPosition = _this.pointsLastPositions.has(point.getID())
							? _this.pointsLastPositions.get(point.getID())
							: null;

						if(prevPosition &&
							(prevPosition.x !== point.position.x || prevPosition.y !== point.position.y)) {
							console.log(`point ${point.getID()} position changed to`, point.position);
						}

						_this.pointsLastPositions.set(point.getID(), point.position.clone());
					}
				});
			},

			pointRemoved: function(e) {
				console.log("points removed", e);
			},

			pointsSet: function(e) {
				console.log("points set", e);
			}
		});
	}

	setRef(ref: Ref) {
		this.ref = ref;
	}
}

class RightAnglePortModel extends DefaultPortModel {
	createLinkModel(factory?: AbstractModelFactory<LinkModel>) {
		return new RefRightAngleLinkModel();
	}
}

function loadSchema(name: string): Schema {
	return JSON.parse(window.localStorage.getItem(name));
}

function hasSchema(name: string) {
	return window.localStorage.getItem(name);
}

function saveSchema(name: string, schema: Schema) {
	window.localStorage.setItem(name, JSON.stringify(schema));
}

class SchemaColumn {
	name: string;
}

class LayoutForeignKey {
	points: Array<LayoutPosition>
}

class SchemaColumnForeignKey extends SchemaColumn {
	reference: string;
	relationship?: string;
	layout?: LayoutForeignKey;
}

class LayoutPosition {
	x: number;
	y: number;
}

class LayoutTable {
	position: LayoutPosition;
}

class SchemaTable {
	name: string;
	primary_keys?: Array<SchemaColumn>;
	foreign_keys?: Array<SchemaColumnForeignKey>;
	columns?: Array<SchemaColumn>;
	layout?: LayoutTable;
}

class SchemaNamespace {
	name: string;
	tables: Array<SchemaTable>;
}

class Schema {
	namespaces: Array<SchemaNamespace>;
}

export default () => {

	const color = 'rgb(0,192,255)';

	var schema: Schema = {
		namespaces: [{
			name: 'hr',
			tables: [{
				name: 'd_employee',
				primary_keys: [{
					name: 'employee_id'
				}],
				columns: [{
					name: 'name'
				}],
				layout: {
					position: {
						x: 500,
						y: 235
					}
				}
			}, {
				name: 'd_offer',
				primary_keys: [{
					name: 'offer_sfid'
				}],
				foreign_keys: [{
					name: 'candidate_employee_fbid',
					reference: 'hr.d_employee.employee_id',
					relationship: '1 to 1',
				}],
				layout: {
					position: {
						x: 115,
						y: 312
					}
				}
			}, {
				name: 'd_internship',
				primary_keys: [{
					name: 'internship_id'
				}],
				foreign_keys: [{
						name: 'employee_id',
						reference: 'hr.d_employee.employee_id'
					}, {
						name: 'manager_employee_id',
						reference: 'hr.d_employee.employee_id'
					}, {
						name: 'offer_sfid',
						reference: 'hr.d_offer.offer_sfid'
					}, {
						name: 'returning_offer_sfid',
						reference: 'hr.d_offer.offer_sfid'
					},
				],
				layout: {
					position: {
						x: 60,
						y: 50
					}
				}
			},
			]
		}]
	};

	const diagramName = "Recuriting high-level";

	// rudimentary way of saving our states for now
	if(!hasSchema(diagramName)) {
		saveSchema(diagramName, schema);
	} else {
		schema = loadSchema(diagramName);
	}

	var startingPositionX = 100;
	var startingPositionY = 100;
	const positionIncrement = 200;

	var increment = 0;
	const diagram = new Diagram(diagramName);

	schema.namespaces.forEach(namespace => {
		const _namespace = new Namespace(namespace.name);

		namespace.tables.forEach(table => {

			var position = new Point(startingPositionX + increment, startingPositionY);

			if(table.layout && table.layout.position) {
				position = new Point(table.layout.position.x, table.layout.position.y);
			}

			const node = new DefaultNodeModel({
				name: table.name,
				color: color,
				position: position,
			});
			const _table = new Table(table.name, node);

			increment += positionIncrement;

			// handle primary keys, foreign keys then the rest of the columns
			if(table.primary_keys) {
				table.primary_keys.forEach(col => {
					_table.addPrimaryKey(col.name);
				});
			}

			if(table.foreign_keys) {
				table.foreign_keys.forEach(col => {
					_table.addForeignKey(
						col.name,
						Ref.fromFulllyQualified(col.reference).setRelationship(col.relationship)
					);
				})
			}

			if(table.columns) {
				table.columns.forEach(col => {
					_table.addColumn(col.name);
				})
			}

			_namespace.addTable(_table);
		});

		diagram.addNamespace(_namespace);
	});


	console.log(diagram);

	var engine = createEngine();
	var model = diagram.finalize(engine);
	engine.setModel(model);

	return (
		<DemoCanvasWidget>
			<CanvasWidget engine={engine} />
		</DemoCanvasWidget>
	);
};
