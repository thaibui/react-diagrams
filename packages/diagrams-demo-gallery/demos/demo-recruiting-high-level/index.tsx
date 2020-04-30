import createEngine, { PointModel, DiagramModel, DefaultNodeModel, DefaultLinkModel, DefaultPortModel, LinkModel, DiagramEngine, RightAngleLinkModel, RightAngleLinkFactory, DefaultLinkModelOptions } from '@projectstorm/react-diagrams';
import * as React from 'react';
import { CanvasWidget, AbstractModelFactory } from '@projectstorm/react-canvas-core';
import { DemoCanvasWidget } from '../helpers/DemoCanvasWidget';
import { DemoButton, DemoWorkspaceWidget } from '../helpers/DemoWorkspaceWidget';
import { Point } from '@projectstorm/geometry';
import { v4 as uuid } from 'uuid';

interface Saveable {
	save(id: string);
	load(id: string): void;
}

interface Finalizable<M, R> {
	finalize(model: M): R;
}

interface SchemaLoader<T> {
	loadSchema(schema: T);
	syncSchema(schema: T);
}

interface FullyQualifiedName {
	namespace: string;
	table: string;
	column: string;
}

abstract class Entity<T, M, R> implements Saveable, Finalizable<M, R>, SchemaLoader<T> {
	constructor() {
	}

	abstract save(id: string);
	abstract load(id: string);
	abstract syncSchema(schema: T);
	abstract loadSchema(schema: T);
	abstract finalize(model: M): R;
}

class Ref extends Entity<SchemaColumnForeignKey, DiagramModelTable, void> {
	private sourceTable: string;
	private sourceNode: DefaultNodeModel;

	public toNamespace: string;
	public toTable: string;
	public toColumn: string;

	public relationship?: string;
	public fromPort?: DefaultPortModel;
	public link?: DefaultLinkModel;

	// positions of points, if there's any. Empty doesn't mean we don't have points; it
	// means the layout will automatically position them in the graph. Update this also
	// doesn't reposition the points on the graph. It merely used as a place to keep
	// track of the last known positions for saving.
	public layoutPointPositions: Array<Point> = [];

	constructor(sourceTable: string, sourceNode: DefaultNodeModel) {
		super();

		this.sourceTable = sourceTable;
		this.sourceNode = sourceNode;
	}

	getRefId(id: string) {
		return `Ref:${id}:${this.fromPort.getName()}->${this.toNamespace}.${this.toTable}.${this.toColumn}`
	}

	save(id: string) {
		window.localStorage.setItem(this.getRefId(id), JSON.stringify(this.layoutPointPositions));
		console.log(this.getRefId(id), "saved", this.layoutPointPositions);
	}

	load(id: string): void {
		const state = window.localStorage.getItem(this.getRefId(id));

		if(state) {
			this.layoutPointPositions = JSON.parse(state);
		}
	}

	loadSchema(schema: SchemaColumnForeignKey) {
		const names = Ref.parseFulllyQualifiedName(schema.reference);

		this.toNamespace = names.namespace;
		this.toTable = names.table;
		this.toColumn = names.column;
		this.relationship = schema.relationship;

		const keyName = `${this.sourceTable}.${schema.name}`;
		const port = this.sourceNode.addPort(new RightAnglePortModel(keyName, schema.name));

		this.setFromPort(port);

		if(schema.layout && schema.layout.points && schema.layout.points.length > 0) {
			this.setLayoutPointPositions(schema.layout.points.map(point => new Point(point.x, point.y)));
		}
	}

	syncSchema(schema: SchemaColumnForeignKey) {
		if(this.layoutPointPositions || this.layoutPointPositions.length > 0) {
			if(!schema.layout) {
				schema.layout = {
					points: []
				};
			}

			schema.layout.points = this.layoutPointPositions;
		}
	}

	finalize(model: DiagramModelTable) {
		const existInPrimary = model.table.primaryKeys.has(this.toColumn);
		const existInForeign = model.table.foreignKeys.has(this.toColumn);
		const existInColumn = model.table.columns.has(this.toColumn);

		let toPort;

		if(!existInPrimary) {
			if(!existInForeign) {
				if(!existInColumn) {
					throw new Error(`Incorrect column ${this.toColumn} from foreign key ` +
						`ref ${this.toString()} for table ${model.table.name}`);
				} else {
					console.warn(`Foreign key ${this.toString()} references a normal column ${this.toColumn} ` +
						`instead of a primary key on table ${model.table.name}`);

					toPort = model.table.columns.get(this.toColumn);
				}
			} else {
				console.warn(`Foreign key ${this.toString()} references a foreign key ${this.toColumn} ` +
					`instead of a primary key on table ${model.table.name}`);

				toPort = model.table.foreignKeys.get(this.toColumn);
			}
		} else {
			toPort = model.table.primaryKeys.get(this.toColumn);
		}

		// establish the link
		const link = this.fromPort.link<RefRightAngleLinkModel>(toPort);
		if(this.layoutPointPositions.length > 0) {
			link.setPoints(this.layoutPointPositions.map(point => link.generatePoint(point.x, point.y)));
			link.setFirstAndLastPathsDirection();
		}
		this.setLink(link);
		link.setRef(this);

		if(this.relationship) {
			link.addLabel(this.relationship);
		}

		model.model.addLink(link);
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

	public static parseFulllyQualifiedName(fullyQualifiedName: string): FullyQualifiedName {
		const splits = fullyQualifiedName.split(".");
		if(splits.length !== 3) {
			throw new Error(`A fully qualified name ${fullyQualifiedName} should have <namespace>.<table>.<column> format`);
		}


		return {
			namespace: splits[0],
			table: splits[1],
			column: splits[2],
		};
	}

	public toString(): string {
		return `${this.toNamespace}.${this.toTable}.${this.toColumn}`;
	}

	/**
	 * Update the link layout with new points or new positions of existing points
	 *
	 * @param points the new positions
	 */
	public setLayoutPointPositions(points: Array<Point>) {
		this.layoutPointPositions = points.map(p => p.clone());
	}

	/**
	 * Update a single point position  in the existing layout
	 *
	 * @param index the index of the position in the existing layout
	 * @param point the new point position
	 */
	public setLayoutPointPosition(index: number, point: Point) {
		this.layoutPointPositions[index] = point.clone();
	}
}

class Table extends Entity<SchemaTable, DiagramModelNamespaces, void> {
	public namespace: string;
	public name: string;
	public node: DefaultNodeModel;
	public primaryKeys: Map<string, DefaultPortModel> = new Map();
	public foreignKeys: Map<string, Ref> = new Map();
	public columns: Map<string, DefaultPortModel> = new Map();

	private layout: LayoutTable;

	TABLE_COLOR = 'rgb(0,192,255)';

	constructor(namespace: string) {
		super();

		this.namespace = namespace;
	}

	addPrimaryKey(name: string) {
		const port = this.node.addPort(new RightAnglePortModel(name, name));
		this.primaryKeys.set(name, port);
	}

	addForeignKey(name: string, ref: Ref, relationship?: string, layout?: LayoutForeignKey) {
		const keyName = `${this.name}.${name}`
		const port = this.node.addPort(new RightAnglePortModel(keyName, name));

		ref.setFromPort(port);

		if(layout && layout.points && layout.points.length > 0) {
			ref.setLayoutPointPositions(layout.points.map(point => new Point(point.x, point.y)));
		}

		if(relationship) {
			ref.setRelationship(relationship);
		}

		this.foreignKeys.set(name, ref);
	}

	addColumn(name: string) {
		const port = this.node.addPort(new RightAnglePortModel(name, name));
		this.columns.set(name, port);
	}

	getRefId(id: string) {
		return `Table:${id}:${this.namespace}.${this.name}`
	}

	save(id: string) {
		window.localStorage.setItem(this.getRefId(id), JSON.stringify(this.layout));
		this.foreignKeys.forEach((ref, _) => ref.save(id));
	}

	load(id: string): void {
		this.layout = JSON.parse(window.localStorage.getItem(this.getRefId(id)));
		this.foreignKeys.forEach((ref, _) => ref.load(id));
	}

	loadSchema(schema: SchemaTable) {
		this.name = schema.name;

		var position = new Point(100, 100);

		if(schema.layout && schema.layout.position) {
			position = new Point(schema.layout.position.x, schema.layout.position.y);
		}

		this.layout = {
			position: position
		}

		const tableName = `${this.namespace}.${schema.name}`;
		this.node = new DefaultNodeModel({
			name: tableName,
			color: this.TABLE_COLOR,
			position: position,
		});

		// handle primary keys, foreign keys then the rest of the columns
		if(schema.primary_keys) {
			this.primaryKeys = new Map();

			schema.primary_keys.forEach(key => {
				this.addPrimaryKey(key.name);
			});
		}

		if(schema.foreign_keys) {
			this.foreignKeys = new Map();

			schema.foreign_keys.forEach(key => {
				const ref = new Ref(schema.name, this.node);
				ref.loadSchema(key);
				this.foreignKeys.set(key.name, ref);
			})
		}

		if(schema.columns) {
			this.columns = new Map();

			schema.columns.forEach(col => {
				this.addColumn(col.name);
			})
		}
	}

	syncSchema(schema: SchemaTable) {
		schema.layout = this.layout;

		if(this.foreignKeys) {
			this.foreignKeys.forEach((ref, columnName) => {
				if(!schema.foreign_keys) {
					schema.foreign_keys = [];
				}
				const schemaForeignKey = schema.foreign_keys.find(key => key.name === columnName);
				ref.syncSchema(schemaForeignKey);
			});
		}
	}

	finalize(model: DiagramModelNamespaces) {
		// finalize table nodes
		model.model.addNode(this.node);
		console.log(`Table ${this.name} is added to diagram`);

		// table layout position listener
		const _this = this;
		this.node.registerListener({
			positionChanged: function(e) {
				_this.layout.position = (e.entity as DefaultNodeModel).getPosition().clone();
			}
		});

		// finalize foreign key nodes
		this.foreignKeys.forEach((ref, _) => {
			const namespace = model.namespaces.get(ref.toNamespace);

			if(!namespace) {
				throw new Error(`Incorrect namespace ${ref.toNamespace} from foreign key ref ${ref} for table ${this.name}`)
			}

			const table = namespace.tables.get(ref.toTable);

			if(!table) {
				throw new Error(`Incorrect table ${namespace.name}.${ref.toTable} from foreign key ref ${ref} for table ${this.name}`)
			}

			ref.finalize({
				model: model.model,
				table: table
			});
		});
	}
}

class Namespace extends Entity<SchemaNamespace, DiagramModelNamespaces, void> {
	public name: string;
	public tables: Map<string, Table> = new Map();

	constructor(name?: string) {
		super();

		this.name = name;
	}

	addTable(table: Table) {
		if(this.tables.has(table.name)) {
			console.warn(`Adding a table ${table.name} will overwrite existing table in namespace ${this.name}`);
		}

		this.tables.set(table.name, table);
	}

	save(id: string) {
		this.tables.forEach(t => t.save(id));
	}

	load(id: string) {
		this.tables.forEach(t => t.load(id));
	}

	loadSchema(schema: SchemaNamespace) {
		this.name = schema.name;
		this.tables = new Map();

		schema.tables.forEach(t => {
			const table = new Table(schema.name);
			table.loadSchema(t);
			this.tables.set(t.name, table);
		});
	}

	syncSchema(schema: SchemaNamespace) {
		this.tables.forEach(t => {
			const schemaTable = schema.tables.find(table => table.name === t.name);
			t.syncSchema(schemaTable)
		});
	}

	finalize(model: DiagramModelNamespaces) {
		this.tables.forEach((table, _) => table.finalize(model));
	}
}

interface DiagramModelTable {
	model: DiagramModel;
	table: Table;
}

interface DiagramModelNamespaces {
	model: DiagramModel;
	namespaces: Map<string, Namespace>;
}

class Diagram extends Entity<Schema, DiagramEngine, DiagramModel> {
	public name: string;
	private namespaces: Map<string, Namespace> = new Map();

	constructor(name: string) {
		super();

		this.name = name;
	}

	addNamespace(namespace: Namespace) {
		if(this.namespaces.has(namespace.name)) {
			console.warn(`Adding a namespace ${namespace.name} will overwrite existing namespace in diagram ${this.name}`);
		}

		this.namespaces.set(namespace.name, namespace);
	}

	/**
	 * Save the diagram into local storage and return the reference id
	 */
	saveAs(): string {
		const id = uuid();

		this.save(id);

		return id;
	}

	save(id: string) {
		this.namespaces.forEach(n => n.save(id));
	}

	load(id: string): void {
		var curSchema = loadSchema(this.name);
		this.namespaces.forEach(n => n.load(id));
		this.syncSchema(curSchema);
		saveSchema(this.name, curSchema);
	}

	loadSchema(schema: Schema) {
		this.namespaces = new Map();

		schema.namespaces.forEach(n => {
			const namespace = new Namespace();
			namespace.loadSchema(n);
			this.namespaces.set(n.name, namespace);
		})
	}

	syncSchema(schema: Schema) {
		this.namespaces.forEach(n => {
			const namespace = schema.namespaces.find(namespace => namespace.name === n.name)
			n.syncSchema(namespace);
		});
	}

	/**
	 * Finalize all the foreign keys and various component to make the diagram and draw them out to the world
	 *
	 * Any missing foreign key connections and typos will throw an error here.
	 */
	finalize(engine: DiagramEngine): DiagramModel {
		const diagramModel = new DiagramModel();
		const diagramModelNamespaces = {
			model: diagramModel,
			namespaces: this.namespaces
		};

		engine.getLinkFactories().registerFactory(new RightAngleLinkFactory());

		this.namespaces.forEach((namespace, _) => namespace.finalize(diagramModelNamespaces));

		console.log("DiagramModel", diagramModel);

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

	registerPositionChangedListener(pointModel: PointModel) {
		const _this = this;

		pointModel.registerListener({
			positionChanged: function(e) {
				const index = _this.getPointIndex(pointModel);
				const prevPosition = _this.ref.layoutPointPositions.length > index
					? _this.ref.layoutPointPositions[index]
					: null;

				if(prevPosition &&
					(prevPosition.x !== pointModel.getPosition().x || prevPosition.y !== pointModel.getPosition().y)) {
					_this.ref.setLayoutPointPositions(_this.points.map(p => p.getPosition()));
				}
			}
		});
	}

	registerEventListeners() {
		var _this = this;

		this.registerListener({
			pointAdded: function(e) {
				// update our layout with the latest point positions (it doesn't save anything yet)
				_this.ref.setLayoutPointPositions(_this.points.map(p => p.getPosition()));
				_this.registerPositionChangedListener(e.point);
				console.log("point added", e);
			},

			selectionChanged: function(e) {
				const link = e.entity as RefRightAngleLinkModel;
			},

			pointRemoved: function(e) {
				console.log("points removed", e);
			},

			pointsSet: function(e) {
				console.log("points set", e);
				_this.getPoints().forEach(pointModel => {
					_this.registerPositionChangedListener(pointModel);
				})
			}
		});
	}

	setRef(ref: Ref) {
		this.ref = ref;
	}
}

class RightAnglePortModel extends DefaultPortModel {
	constructor(name: string, label: string) {
		super(true, name, label);
	}

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

class ERDApp extends React.Component<any, any> {
	id = null;

	constructor(props: any) {
		super(props);

		this.save = this.save.bind(this);
		this.load = this.load.bind(this);
		this.updateLoadId = this.updateLoadId.bind(this);
	}

	updateLoadId(e) {
		this.id = e.target.value;
	}

	load(e) {
		const { diagram } = this.props;

		diagram.load(this.id);

		console.log("loaded saved id: " + this.id);
	}

	save(e) {
		const { diagram } = this.props;

		const id = diagram.saveAs();

		console.log("diagram saved as id: ", id);
	}

	render() {
		const { engine } = this.props;

		return (
			<DemoWorkspaceWidget
				buttons={
					<div>
						<DemoButton onClick={this.save}>Save</DemoButton>
						<DemoButton onClick={this.load}>Load</DemoButton>
						<input onChange={this.updateLoadId} style={{ marginLeft: 5 }} type="text" name="load" />
					</div>
				}
			>
				<DemoCanvasWidget>
					<CanvasWidget engine={engine} />
				</DemoCanvasWidget>
			</DemoWorkspaceWidget>
		);
	}
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

	const diagram = new Diagram(diagramName);
	diagram.loadSchema(schema);

	console.log(diagram);

	var engine = createEngine();
	var model = diagram.finalize(engine);
	engine.setModel(model);

	return (
		<ERDApp engine={engine} diagram={diagram} ></ERDApp>
	);
};
