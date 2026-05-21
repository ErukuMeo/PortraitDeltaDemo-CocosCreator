# 前言

有天，自己想要做一个动态生成element的组件，但cocos的组件不支持，了解一下后发现inspector可以做到这件事，翻了一下论坛帖子，关于扩展inspector的帖子少的可怜，在这时候，我！工具人一号看不过去了， 于是有了这篇帖子的诞生（小声bb：这比写插件还玄学，坑到怀疑人生）

注：学习inspector扩展最好具有开发插件经验或了解插件开发

# 准备工作

其实扩展inspector和写插件类似，但又有一部分不同，我们先新建一个插件，然后在插件中建立一个存放我们当前扩展的inspector脚本的文件夹，如下 （我的插件文件夹是inspectors，在其中新建了一个名叫monitor的inspector扩展文件夹）

```
packages/
    - _module/
    - button-bind/
    - inspectors/
        - js/
        - monitor/
            - main.ts
            - select_var.ts
            - trigger.ts
        - main.ts
        - package.json
        - tsconfig.json
    - path-generate/
```

文件夹建好后再在其中建立当前inspector扩展的main入口脚本，然后在插件入口脚本中 require 当前扩展的 main 入口脚本

```ts
///<reference path="../. ./editor/editor-assetDB.d.ts"/>
///<reference path="../../editor/editor-main.d.ts"/>
///<reference path="../../editor/editor-renderer.d.ts"/>
///<reference path=". ./. ./editor/editor-scene.d.ts"/>
///<reference path="../. ./editor/editor-share.d.ts"/>
///<reference path=". ./. ./editor/engine.d.ts"/>
///<reference path="../../editor/vue.d.ts"/>
///<reference path="../../editor/cc.d.ts"/>
///<reference path=". ./. ./editor/fs.d.ts"/>
///<reference path="../. ./creator.d.ts"/>
///<reference path=". ./_module/component_base.ts"/>
///<reference path=". ./_module/view/array-ts"/>
///<reference path="../_module/view/select.ts"/>
///<reference path=". ./_module/view/event_handler.ts"/>
// @ts-ignore
const name_s = "inspectors";

module main {
    export function load() {
        try {
            require("./monitor/main");
        } catch (e) {}
    }
    export function unload() {
        // excute when package unloaded
    }
    export const messages = {};
}
module.exports = main;
```

这里可能大家有点疑惑，为什么我不把require放在上面呢？这是因为如果你放在上面那么引用这个脚本编辑器会直接报错：Failed to load inspector xxx，这是其中一个坑点。
那么我们为什么要require这个inspector的入口脚本呢？这是因为自定义inspecror是需要加一个装饰器在组件类上的，如下：

```typescript
@ccclass
@inspector("packages://inspectors/js/inspectors/monitor/main.js")
export class monitor extends cc.Component {
    private _anim_o: cc.Animation;
    private _sprite_o: cc.Sprite;
    ...
}
```

装饰器内的参数就是inspector入口脚本所在的路径；这样编辑器才知道我们引用的是哪个inspector，好了，插件建好了，扩展入口脚本建立了，组件的inspector引用地址填写了，接下来我们就该编写想要的效果代码了。

# 建立inspector脚本模板

直接将下面代码复制到扩展的main.ts中

```typescript
module panel {
    // @ts-ignore
    const name_s = "inspectors";
    // @ts-ignore
    const component_s = "monitor";
    /* ***************自定义*************** */
    //@ts-ignore
    export const monitor = cc.require("monitor");
    /*---------enum_private */
    /*---------enum_public */
    /*---------interface_private */
    /*---------interface_public */
    /**组件数据 */
    export interface component_data {
        /**这里和我们扩展inspecrtor的组件类数据声明一致 */
    }
    /*---------var | const */
    /*---------class_private */
    /*---------class_public */
    /**数据 */
    export class model {
        /**组件数据 */
        component_data_o: component_data;
    }
    // html template for panel
    export let template = `
    `;
    export const $ = {};
    export const props = {
        target: {
            twoWay: true,
            type: Object,
        },
    };
    export function data() {
        return new model();
    }
    export const methods = {
        self: {},
        init(self: vue.target & typeof props & model = this.self): void {},
    };

    type target = vue.target & typeof methods & typeof props & model;

    export async function init(this: target) {
        // cc.log("init");
        // ------------------安全初始化
        await new Promise((resolve_f) => {
            let handle_o = setInterval(() => {
                if (this.$el) {
                    clearInterval(handle_o);
                    /**当前节点 */
                    let node_o = cc.engine.getInstanceById(this.target["node"].value.uuid);
                    // 当前组件
                    this.component_data_o = <any>node_o.getComponents(cc.Component).find((v1_o) => v1_o.uuid == this.target["uuid"].value);
                    methods.self = this;
                    methods.init();
                    resolve_f(null);
                }
            }, 100);
        });
    }
    // export function created(this: target) {
    //     cc.log("created");
    // }
}

globalThis["Vue"].component("monitor", panel);
```

注：

name_s： 插件名
component_s: 扩展名/组件名
export const monitor = cc.require(“monitor”)： 这是我们需要扩展inspector的组件，因为我们后面会用到，只需要填写这个组件的脚本名，不需要路径，这个前提是你的项目中不存在重名脚本，不然cc.require找到的可能不是你想要的。
globalThis["Vue"].component("monitor", panel); 这段语句中的monitor是Vue中的组件名
好了，现在代码模板已经准备好了，接下来就是自定义时间了。

# 小试身手！

先让我们来测试一下，在template中加入一段字符串 <ui-button @confirm=test>Test</ui-button>，然后在methods中创建一个名为test的函数，里面添加打印。

```typescript
// html template for panel
export let template = `
<ui-button @confirm=test>Test</ui-button>
`
export const $ = {};
export const props = {
    target: {
        twoWay: true,
        type: Object,
    }
}

export function data() {
    return new model;
}

export const methods =  {
    test(): void {
        cc.log("hello inspector");
    }
    init(self: vue.target & typeof props & model): void {
        ...
    }
    ...
```

然后 控制台tsc编译、编辑器ctrl + r刷新， 你就会发现你的组件样式已经变成了一个button，

在点击按钮后编辑器控制台会打印hello inspector的字样，这是因为 @confirm=test 设置了methods 中的test函数为回调函数，test中打印了该语句。到这里大家应该就知道怎么初步扩展inspector了，而所用的组件都可以在 cocos 的 UI-Kit 5 中查找， 想要提前查看效果可在菜单栏中的开发者选项中查看， 这里不过多赘述

# 复杂控件开发

接上，如果我们想要一些精美的组件样式或者有ui-kit组件达不到的效果该怎么办呢？这里就需要dom操作了，而直接调用dom的getElementById去拿element的时候，你会发现返回值为空，这其实是shadow-root搞的鬼，而我自己对于网页开发的经验基本为零，这里不过多赘述。
在经过我反复的测试中，发现扩展的Vue组件会在一段时间后（在init和created回调后）给this添加一个字段为$el的数据，而这个$el的parentNode，就是我们inspector扩展的element根节点， 所以就可以通过这个节点来动态添加我们自定义的控件，这也是为什么我在init中设置定时器去初始化，这就是为了保证this.$el的存在，然后通过操作当前的element节点去达到添加自定义控件的目的。

至于如何编写控件，你需要掌握一部分dom操作和编写html代码的知识，在这里基本是面向百度编程，不过我会给大家留下我编写的公共控件，如有需要可在末尾附件自行下载学习。

# 组件数据如何保存？

看完上面的操作后，相信你已经对扩展控件的视图操作有所了解，那我们的控件数据如何保存呢？哈哈，当然是通过我们模板代码中的 this.component_data_o 进行对组件数据读/写，当然你需要先把我们扩展的组件类的接口 component_data 编写好，就可以直接通过 this.component_data_o 来进行操作了，当然这里仅仅局限于基础数据类型数据。
对于自定义类型的数据而言，需要特殊的创建操作，比如下面这个`global_key`类型

```typescript
@ccclass("monitor/global_key")
export class global_key {
    /**监听全局变量键*/
    @property([cc.String]) key_ss: string[] = [];
    /**触发条件*/
    @property({ type: cc.Enum(_monitor.condition) })
    condition_e = _monitor.condition["=="];
    /**比较值*/
    @property(cc.String)
    value_s = "";
}

@ccclass
@inspector("packages://inspectors/js/inspectors/monitor/main.js")
export class monitor extends cc.Component {
    private _anim_o: cc.Animation;
    private _sprite_o: cc.Sprite;

    @property([cc.Enum(event_config.data)])
    event_es: event_config.data[] = [];
    @property([global_key])
    global_key_os: global_key[] = [];
    @property([trigger])
    trigger_os: trigger[] = [];
}
```

我们在组件中用到了它，并且这是一个数组，那么我们创建数据的时候就需要去主动的 new 这个数据类型，那么如何获取这个数据类型呢？ 就是通过模板里面写的 export const monitor = cc.require("monitor"); 语句获取，因为这个类型已经通过export导出了，所以可以直接通过monitor.global_key的方式拿到它，创建对象的时候可以通过 new monitor.global_key 创建这个自定义类型数据，当然还有一种方式可以直接创建，但并不推荐。就是直接把这个类型复制过来（图中第一个红框内的所有代码），这种方式会在你启动编辑器之后会报错，但不影响其他东西。

# 坑点讲解

1. 不要尝试将self放在外层，这会让你在同一节点添加相同组件时导致数据混乱
2. 任何在panel模块外的东西都会在编辑器的一次刷新中丢失！使用的变量必须写在panel模块内！
3. 如果你想要使用一个会修改的全局数据，请把它放在init中初始化，不要放在外层。
4. inspector的入口脚本中相对路径require无效，必须使用全路径
5. 最坑点：inspector不能和cocos自带的组件样式嵌套，这意味着你需要自己编写你需要的所有组件样式
